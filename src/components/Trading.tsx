import { useCallback, useEffect, useState } from 'react'
import { erc20Abi, formatUnits, parseUnits, type Address } from 'viem'
import * as sdk from '@ammora-protocol/sdk'
import {
  WETH,
  arlClient,
  curveClient,
  giwaSepolia,
  publicClient,
  shortAddr,
  waitForHeadPast,
  withRetry,
} from '../lib/ammora'
import { getWalletClient, wrapEth } from '../lib/wallet'
import { Btn, Card, ErrorBox, Field, StatusBadge, TxLink, inputCls } from './ui'

type Side = 'buy' | 'sell'

export default function Trading({
  account,
  curve,
  onCurveChange,
}: {
  account: Address | null
  curve: Address
  onCurveChange: (curve: Address) => void
}) {
  const [curveInput, setCurveInput] = useState<string>(curve)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [state, setState] = useState<Awaited<ReturnType<ReturnType<typeof curveClient>['getState']>> | null>(null)
  const [tokenMeta, setTokenMeta] = useState<{ name: string; symbol: string; decimals: number } | null>(null)
  const [balances, setBalances] = useState<{ eth: string; weth: string; token: string } | null>(null)
  const [side, setSide] = useState<Side>('buy')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState('100')
  const [quote, setQuote] = useState<{ out: string; fee: string; kind: string; left: string } | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pool, setPool] = useState<Address | null>(null)
  const [poolState, setPoolState] = useState<Awaited<ReturnType<ReturnType<typeof arlClient>['getPoolState']>> | null>(null)
  const [txs, setTxs] = useState<string[]>([])
  const [migrating, setMigrating] = useState(false)

  const load = useCallback(async (curveAddr: Address) => {
    setLoading(true)
    setErr('')
    setState(null)
    setPool(null)
    setPoolState(null)
    setQuote(null)
    try {
      const c = curveClient(curveAddr)
      const st = await withRetry(() => c.getState())
      setState(st)
      if (st.status === 3 && st.canonicalPool !== '0x0000000000000000000000000000000000000000') {
        setPool(st.canonicalPool as Address)
        const arl = arlClient(st.canonicalPool)
        const ps = await withRetry(() => arl.getPoolState())
        setPoolState(ps)
      }
      const [name, symbol, decimals] = await Promise.all([
        publicClient.readContract({ address: st.baseToken, abi: erc20Abi, functionName: 'name' }),
        publicClient.readContract({ address: st.baseToken, abi: erc20Abi, functionName: 'symbol' }),
        publicClient.readContract({ address: st.baseToken, abi: erc20Abi, functionName: 'decimals' }),
      ])
      setTokenMeta({ name, symbol, decimals })
      if (account) {
        const [eth, weth, token] = await Promise.all([
          publicClient.getBalance({ address: account }),
          publicClient.readContract({ address: WETH, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
          publicClient.readContract({ address: st.baseToken, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
        ])
        setBalances({ eth: formatUnits(eth, 18), weth: formatUnits(weth, 18), token: formatUnits(token, decimals) })
      }
    } catch (e) {
      setErr(`Could not load curve: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [account])

  useEffect(() => {
    setCurveInput(curve)
    load(curve)
  }, [curve, load])

  async function refreshBalances() {
    if (!account || !state || !tokenMeta) return
    const [eth, weth, token] = await Promise.all([
      publicClient.getBalance({ address: account }),
      publicClient.readContract({ address: WETH, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
      publicClient.readContract({ address: state.baseToken, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
    ])
    setBalances({ eth: formatUnits(eth, 18), weth: formatUnits(weth, 18), token: formatUnits(token, tokenMeta.decimals) })
  }

  async function sendTx(tx: { to: Address; data: `0x${string}`; value?: bigint }): Promise<`0x${string}`> {
    const wc = getWalletClient()
    const hash = await wc.sendTransaction({ account: account as Address, chain: giwaSepolia, to: tx.to, data: tx.data, value: tx.value ?? 0n })
    setTxs((t) => [...t, hash])
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(`Transaction reverted: ${hash}`)
    await waitForHeadPast(receipt.blockNumber)
    return hash
  }

  async function approveIfNeeded(tokenAddr: Address, spender: Address, amountRaw: bigint) {
    if (!account) return
    const allowance = await publicClient.readContract({
      address: tokenAddr, abi: erc20Abi, functionName: 'allowance', args: [account, spender],
    })
    if (allowance >= amountRaw) return
    const wc = getWalletClient()
    const hash = await wc.writeContract({
      account, chain: giwaSepolia, address: tokenAddr, abi: erc20Abi,
      functionName: 'approve', args: [spender, amountRaw],
    })
    setTxs((t) => [...t, hash])
    const r = await publicClient.waitForTransactionReceipt({ hash })
    if (r.status !== 'success') throw new Error(`Approval reverted: ${hash}`)
  }

  async function doQuote() {
    setErr('')
    setQuote(null)
    if (!state || !tokenMeta) return
    let amountRaw: bigint
    try {
      amountRaw = parseUnits(amount, side === 'buy' ? 18 : tokenMeta.decimals)
    } catch {
      return setErr('Enter a valid amount.')
    }
    if (amountRaw <= 0n) return setErr('Amount must be positive.')
    setQuoting(true)
    try {
      const block = await publicClient.getBlockNumber()
      if (state.status === 1) {
        const c = curveClient(curve)
        const q = await c.quoteExactInputAtBlock(amountRaw, side === 'sell', block)
        const fill = sdk.classifyAmmoraV4ExactInputFill(q, side === 'sell')
        setQuote({
          out: formatUnits(q.amountOut, side === 'buy' ? tokenMeta.decimals : 18),
          fee: formatUnits(q.fee, side === 'buy' ? 18 : tokenMeta.decimals),
          kind: fill.kind,
          left: formatUnits(q.amountLeft, side === 'buy' ? 18 : tokenMeta.decimals),
        })
      } else if (state.status === 3 && pool) {
        const arl = arlClient(pool)
        const tokenIn = side === 'buy' ? WETH : state.baseToken
        const q = await arl.quoteExactInput(tokenIn, amountRaw)
        setQuote({
          out: formatUnits(q.amountOut, side === 'buy' ? tokenMeta.decimals : 18),
          fee: formatUnits(q.fee, side === 'buy' ? 18 : tokenMeta.decimals),
          kind: 'full',
          left: '0',
        })
      } else {
        setErr('This curve is not tradable right now (status ' + state.status + ').')
      }
    } catch (e) {
      setErr(`Quote failed: ${(e as Error).message}`)
    } finally {
      setQuoting(false)
    }
  }

  async function doTrade() {
    if (!account || !state || !tokenMeta) return setErr('Connect your wallet first.')
    let amountRaw: bigint
    try {
      amountRaw = parseUnits(amount, side === 'buy' ? 18 : tokenMeta.decimals)
    } catch {
      return setErr('Enter a valid amount.')
    }
    const slippageBps = parseInt(slippage, 10)
    if (!Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 5000) return setErr('Slippage must be 0–5000 bps.')
    setBusy(true)
    setErr('')
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800)
      if (state.status === 1) {
        // Fresh client + fresh block: stale quotes revert on-chain.
        const block = await publicClient.getBlockNumber()
        const c = curveClient(curve)
        const q = await c.quoteExactInputAtBlock(amountRaw, side === 'sell', block)
        const fill = sdk.classifyAmmoraV4ExactInputFill(q, side === 'sell')
        const plan = await c.planSwapExactInput({
          includedAmountIn: amountRaw,
          baseForQuote: side === 'sell',
          allowPartialFill: fill.allowPartialFill,
          slippageBps,
          recipient: account,
          deadline,
        })
        const tokenIn = side === 'buy' ? WETH : state.baseToken
        await approveIfNeeded(tokenIn, curve, amountRaw)
        await sendTx(plan.transaction)
        await load(curve)
        await refreshBalances()
      } else if (state.status === 3 && pool) {
        const arl = arlClient(pool)
        const tokenIn = side === 'buy' ? WETH : state.baseToken
        const plan = await arl.planSwapExactInput({ tokenIn, amountIn: amountRaw, slippageBps, recipient: account, deadline })
        for (const req of plan.approvalRequirements) await approveIfNeeded(req.token, req.spender, req.amount)
        await sendTx(plan.transaction)
        await load(curve)
        await refreshBalances()
      } else {
        throw new Error('Curve is not tradable in its current status.')
      }
      setQuote(null)
      setAmount('')
    } catch (e) {
      setErr(`Trade failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function doMigrate() {
    if (!account || !state) return
    setMigrating(true)
    setErr('')
    try {
      const c = curveClient(curve)
      const block = await publicClient.getBlockNumber()
      const plan = await c.planMigrateAtBlock(block)
      await sendTx(plan.transaction)
      await load(curve)
    } catch (e) {
      setErr(`Migration failed: ${(e as Error).message}`)
    } finally {
      setMigrating(false)
    }
  }

  async function doWrap() {
    if (!account) return
    setBusy(true)
    setErr('')
    try {
      const hash = await wrapEth(account, 1_000_000_000_000_000n) // 0.001 ETH
      setTxs((t) => [...t, hash])
      const r = await publicClient.waitForTransactionReceipt({ hash })
      if (r.status !== 'success') throw new Error(`Wrap reverted: ${hash}`)
      await refreshBalances()
    } catch (e) {
      setErr(`Wrap failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const price = state && tokenMeta
    ? state.status === 1
      ? `1 ${tokenMeta.symbol} ≈ ${state.quoteReserve > 0n && state.baseReserve > 0n ? (Number(formatUnits(state.quoteReserve, 18)) / Number(formatUnits(state.baseReserve, tokenMeta.decimals))).toFixed(8) : '—'} WETH (curve)`
      : poolState
        ? `1 ${tokenMeta.symbol} ≈ ${(Number(formatUnits(poolState.reserveQuote, 18)) / Number(formatUnits(poolState.reserveBase, tokenMeta.decimals))).toFixed(8)} WETH (pool)`
        : '—'
    : '—'

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field label="Curve address">
              <input className={inputCls} value={curveInput} onChange={(e) => setCurveInput(e.target.value)} placeholder="0x… curve" />
            </Field>
          </div>
          <Btn
            onClick={() => {
              const v = curveInput.trim()
              if (/^0x[0-9a-fA-F]{40}$/.test(v)) onCurveChange(v as Address)
              else setErr('Invalid curve address.')
            }}
          >
            Load curve
          </Btn>
        </div>
        {loading && <p className="mt-3 text-sm text-slate-400">Loading curve…</p>}
        {state && tokenMeta && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold">{tokenMeta.name} ({tokenMeta.symbol})</h2>
              <StatusBadge status={state.status} />
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-xl bg-ink p-3"><div className="text-xs uppercase text-slate-500">Price</div><div className="mt-1 font-mono">{price}</div></div>
              <div className="rounded-xl bg-ink p-3">
                <div className="text-xs uppercase text-slate-500">Graduation</div>
                <div className="mt-1 font-mono">{formatUnits(state.quoteReserve, 18)} / {formatUnits(state.migrationQuoteThreshold, 18)} WETH</div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-accent" style={{ width: `${state.migrationQuoteThreshold > 0n ? Math.min(100, Number((state.quoteReserve * 10000n) / state.migrationQuoteThreshold) / 100) : 0}%` }} />
                </div>
              </div>
              <div className="rounded-xl bg-ink p-3">
                <div className="text-xs uppercase text-slate-500">Fee</div>
                <div className="mt-1 font-mono">{(state.currentFeeBps / 100).toFixed(2)}% per trade</div>
                <div className="font-mono text-xs text-slate-500">Pool: {pool ? shortAddr(pool) : state.status === 3 ? '…' : '—'}</div>
              </div>
            </div>
            {balances && (
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-300">
                <span>ETH: <b className="font-mono">{Number(balances.eth).toFixed(4)}</b></span>
                <span>WETH: <b className="font-mono">{Number(balances.weth).toFixed(6)}</b></span>
                <span>{tokenMeta.symbol}: <b className="font-mono">{Number(balances.token).toFixed(2)}</b></span>
                <Btn variant="ghost" onClick={doWrap} disabled={busy}>Wrap 0.001 ETH → WETH</Btn>
              </div>
            )}
          </div>
        )}
      </Card>

      {state && state.status === 2 && (
        <Card>
          <h3 className="text-lg font-bold text-amber-300">Ready to migrate</h3>
          <p className="mt-1 text-sm text-slate-400">
            The curve raised its graduation threshold. Migration is a separate permissionless
            transaction that creates the concentrated pool and mints the LP NFTs.
          </p>
          <div className="mt-3">
            <Btn onClick={doMigrate} disabled={migrating || !account}>{migrating ? 'Migrating…' : 'Migrate to pool'}</Btn>
          </div>
        </Card>
      )}

      {state && (state.status === 1 || state.status === 3) && tokenMeta && (
        <Card>
          <div className="flex gap-2">
            <Btn variant={side === 'buy' ? 'primary' : 'ghost'} onClick={() => { setSide('buy'); setQuote(null) }}>Buy {tokenMeta.symbol}</Btn>
            <Btn variant={side === 'sell' ? 'primary' : 'ghost'} onClick={() => { setSide('sell'); setQuote(null) }}>Sell {tokenMeta.symbol}</Btn>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label={side === 'buy' ? 'Pay (WETH)' : `Pay (${tokenMeta.symbol})`}>
              <input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.0" />
            </Field>
            <Field label="Slippage (bps)" hint="100 bps = 1%.">
              <input className={inputCls} value={slippage} onChange={(e) => setSlippage(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn variant="ghost" onClick={doQuote} disabled={quoting || !amount}>Get quote</Btn>
            <Btn onClick={doTrade} disabled={busy || !account || !amount}>{busy ? 'Sending…' : side === 'buy' ? `Buy ${tokenMeta.symbol}` : `Sell ${tokenMeta.symbol}`}</Btn>
          </div>
          {quote && (
            <div className="mt-4 rounded-xl bg-ink p-3 text-sm">
              <div>Expected out: <b className="font-mono">{quote.out} {side === 'buy' ? tokenMeta.symbol : 'WETH'}</b></div>
              <div>Fee: <span className="font-mono">{quote.fee}</span></div>
              <div>Fill: <span className="font-mono">{quote.kind}</span>{Number(quote.left) > 0 && <span> · unused input returned: <span className="font-mono">{quote.left}</span></span>}</div>
              <p className="mt-1 text-xs text-slate-500">Quote is re-taken fresh right before signing — stale quotes revert on-chain.</p>
            </div>
          )}
          {!account && <p className="mt-3 text-sm text-amber-300">Connect your wallet to trade.</p>}
        </Card>
      )}

      {txs.length > 0 && (
        <Card>
          <h3 className="font-bold">Session transactions</h3>
          <div className="mt-2 space-y-1">
            {txs.map((h) => (
              <div key={h}><TxLink hash={h} /></div>
            ))}
          </div>
        </Card>
      )}
      {err && <ErrorBox msg={err} />}
    </div>
  )
}
