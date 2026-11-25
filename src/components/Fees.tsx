import { useState } from 'react'
import { erc20Abi, formatUnits, type Address } from 'viem'
import * as sdk from '@ammora-protocol/sdk'
import {
  FEATURED_LAUNCH,
  arlClient,
  curveClient,
  giwaSepolia,
  publicClient,
  withRetry,
} from '../lib/ammora'
import { getWalletClient } from '../lib/wallet'
import { Btn, Card, ErrorBox, Field, TxLink, inputCls } from './ui'

export default function Fees({ account }: { account: Address | null }) {
  const [curveInput, setCurveInput] = useState<string>(FEATURED_LAUNCH.curve)
  const [feeVault, setFeeVault] = useState<Address | ''>('')
  const [baseToken, setBaseToken] = useState<Address | ''>('')
  const [quoteToken, setQuoteToken] = useState<Address | ''>('')
  const [claimableWeth, setClaimableWeth] = useState<string>('')
  const [claimableBase, setClaimableBase] = useState<string>('')
  const [baseSymbol, setBaseSymbol] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [poolInput, setPoolInput] = useState<string>(FEATURED_LAUNCH.pool)
  const [nftId, setNftId] = useState('')
  const [txs, setTxs] = useState<string[]>([])

  async function load() {
    const v = curveInput.trim()
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return setErr('Invalid curve address.')
    setErr('')
    setLoading(true)
    try {
      const c = curveClient(v as Address)
      const st = await withRetry(() => c.getState())
      setFeeVault(st.feeVault as Address)
      setBaseToken(st.baseToken as Address)
      setQuoteToken(st.quoteToken as Address)
      const [symbol, decimals] = await Promise.all([
        publicClient.readContract({ address: st.baseToken, abi: erc20Abi, functionName: 'symbol' }),
        publicClient.readContract({ address: st.baseToken, abi: erc20Abi, functionName: 'decimals' }),
      ])
      setBaseSymbol(symbol)
      if (account) {
        const [cw, cb] = await Promise.all([
          publicClient.readContract({ address: st.feeVault, abi: sdk.feeVaultAbi, functionName: 'claimable', args: [st.quoteToken, account] }) as Promise<bigint>,
          publicClient.readContract({ address: st.feeVault, abi: sdk.feeVaultAbi, functionName: 'claimable', args: [st.baseToken, account] }) as Promise<bigint>,
        ])
        setClaimableWeth(formatUnits(cw, 18))
        setClaimableBase(formatUnits(cb, decimals))
      }
    } catch (e) {
      setErr(`Could not load fee data: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function claimFee(token: Address) {
    if (!account || !feeVault) return
    setBusy(true)
    setErr('')
    try {
      const wc = getWalletClient()
      const hash = await wc.writeContract({
        account, chain: giwaSepolia, address: feeVault, abi: sdk.feeVaultAbi,
        functionName: 'claimFor', args: [token, account, account],
      })
      setTxs((t) => [...t, hash])
      const r = await publicClient.waitForTransactionReceipt({ hash })
      if (r.status !== 'success') throw new Error(`Claim reverted: ${hash}`)
      await load()
    } catch (e) {
      setErr(`Claim failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function claimLpFees() {
    if (!account) return setErr('Connect your wallet first.')
    const pool = poolInput.trim()
    if (!/^0x[0-9a-fA-F]{40}$/.test(pool)) return setErr('Invalid pool address.')
    const id = BigInt(nftId || '0')
    if (id <= 0n) return setErr('Enter your LP NFT id (a positive integer).')
    setBusy(true)
    setErr('')
    try {
      const arl = arlClient(pool as Address)
      const tx = await arl.planClaimManagedConcentratedFees(id, account, account)
      const wc = getWalletClient()
      const hash = await wc.sendTransaction({ account, chain: giwaSepolia, to: tx.to, data: tx.data, value: tx.value ?? 0n })
      setTxs((t) => [...t, hash])
      const r = await publicClient.waitForTransactionReceipt({ hash })
      if (r.status !== 'success') throw new Error(`LP claim reverted: ${hash}`)
    } catch (e) {
      setErr(`LP claim failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-xl font-bold">Creator &amp; Partner fee claims</h2>
        <p className="mt-1 text-sm text-slate-400">
          Trading on a curve accrues fees to its FeeVault. The Creator and the Partner each claim
          their own entitlement — this screen reads yours for the connected wallet and claims it.
        </p>
        <div className="mt-3 flex gap-2">
          <input className={inputCls} value={curveInput} onChange={(e) => setCurveInput(e.target.value)} placeholder="0x… curve address" />
          <Btn onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Load fees'}</Btn>
        </div>
        {feeVault && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-ink p-4">
              <div className="text-xs uppercase text-slate-500">Claimable (WETH)</div>
              <div className="mt-1 font-mono text-lg">{claimableWeth === '' ? '…' : claimableWeth}</div>
              <Btn className="mt-3" onClick={() => claimFee(quoteToken as Address)} disabled={busy || !account || claimableWeth === '' || Number(claimableWeth) <= 0}>
                Claim WETH fees
              </Btn>
            </div>
            <div className="rounded-xl bg-ink p-4">
              <div className="text-xs uppercase text-slate-500">Claimable ({baseSymbol || 'token'})</div>
              <div className="mt-1 font-mono text-lg">{claimableBase === '' ? '…' : claimableBase}</div>
              <Btn className="mt-3" onClick={() => claimFee(baseToken as Address)} disabled={busy || !account || claimableBase === '' || Number(claimableBase) <= 0}>
                Claim {baseSymbol || 'token'} fees
              </Btn>
            </div>
          </div>
        )}
        {!account && <p className="mt-3 text-sm text-amber-300">Connect your wallet to see your claimable fees.</p>}
        <p className="mt-3 text-xs text-slate-500">
          FeeVault: <span className="font-mono">{feeVault || '—'}</span> · Zero-claimable claims are no-ops, not payments.
        </p>
      </Card>

      <Card>
        <h2 className="text-xl font-bold">LP NFT fee claims</h2>
        <p className="mt-1 text-sm text-slate-400">
          After a curve migrates, the liquidity sits in concentrated LP positions owned as NFTs by
          the Position Manager. The NFT owner claims the pool fees that accrued to that position.
        </p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <Field label="Pool address">
            <input className={inputCls} value={poolInput} onChange={(e) => setPoolInput(e.target.value)} />
          </Field>
          <Field label="Your LP NFT id" hint="The Position Manager NFT id from your migration (e.g. 160).">
            <input className={inputCls} value={nftId} onChange={(e) => setNftId(e.target.value)} inputMode="numeric" placeholder="e.g. 160" />
          </Field>
        </div>
        <div className="mt-3">
          <Btn onClick={claimLpFees} disabled={busy || !account}>Claim LP fees for this NFT</Btn>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Example from our demo launch: GPAD migration minted LP NFTs #160, #161 and #162 to the
          launchpad wallet — fees on #160 and #162 were claimed on-chain (see Explorer). Those NFTs
          belong to the demo wallet, not to you.
        </p>
      </Card>

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
