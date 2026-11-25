import { useEffect, useState } from 'react'
import { formatUnits, parseUnits, type Address } from 'viem'
import * as sdk from '@ammora-protocol/sdk'
import {
  BANNED_TEMPLATE_ID,
  FACTORY,
  REGISTRY,
  deriveConfigFromTemplate,
  giwaSepolia,
  listQualifiedTemplates,
  publicClient,
  shortAddr,
  waitForHeadPast,
  withRetry,
  type TemplateRow,
} from '../lib/ammora'
import { getWalletClient } from '../lib/wallet'
import { Btn, Card, ErrorBox, Field, TxLink, inputCls } from './ui'

type Step = 'idle' | 'preview' | 'config' | 'launch' | 'done'

export default function LaunchStudio({
  account,
  onLaunched,
}: {
  account: Address | null
  onLaunched: (token: Address, curve: Address) => void
}) {
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [templateId, setTemplateId] = useState<string>('45')
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [saleSupply, setSaleSupply] = useState('1000')
  const [quoteThreshold, setQuoteThreshold] = useState('0.000001')
  const [metadataURI, setMetadataURI] = useState('https://stalkerindie.github.io/ammora-launchpad/token.json')
  const [step, setStep] = useState<Step>('idle')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState<ReturnType<typeof deriveConfigFromTemplate> | null>(null)
  const [configId, setConfigId] = useState<string>('')
  const [configHash, setConfigHash] = useState<string>('')
  const [configTx, setConfigTx] = useState<string>('')
  const [token, setToken] = useState<Address | ''>('')
  const [curve, setCurve] = useState<Address | ''>('')
  const [launchTx, setLaunchTx] = useState<string>('')
  const [txs, setTxs] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    listQualifiedTemplates(12)
      .then((rows) => {
        if (!alive) return
        setTemplates(rows)
        if (rows.some((r) => r.configId === 45n)) setTemplateId('45')
        else if (rows.length) setTemplateId(rows[0].configId.toString())
      })
      .catch((e) => alive && setErr(`Could not load templates: ${(e as Error).message}`))
      .finally(() => alive && setLoadingTemplates(false))
    return () => {
      alive = false
    }
  }, [])

  const template = templates.find((t) => t.configId.toString() === templateId)
  const decimals = template?.tokenDecimals ?? 9

  async function doPreview() {
    setErr('')
    if (!account) return setErr('Connect your wallet first.')
    if (!template) return setErr('Pick a template first.')
    if (!name.trim() || !symbol.trim()) return setErr('Enter a token name and symbol.')
    let supplyRaw: bigint
    let thresholdRaw: bigint
    try {
      supplyRaw = parseUnits(saleSupply, decimals)
      thresholdRaw = parseUnits(quoteThreshold, 18)
    } catch {
      return setErr('Sale supply / threshold must be valid numbers.')
    }
    if (supplyRaw <= 0n || thresholdRaw <= 0n) return setErr('Sale supply and threshold must be positive.')
    setBusy(true)
    try {
      const block = await publicClient.getBlockNumber()
      const snap = await withRetry(() => sdk.getAmmoraV4ConfigAtBlock(publicClient, REGISTRY, BigInt(templateId), block))
      if (snap.configHash.toLowerCase() !== template.configHash.toLowerCase()) {
        throw new Error('Template changed on-chain since the list loaded. Reload and try again.')
      }
      const derived = deriveConfigFromTemplate(snap, supplyRaw, thresholdRaw)
      // Recipients: everything goes to the connected wallet for this launchpad.
      derived.config = {
        ...derived.config,
        partnerRecipient: account,
        leftoverReceiver: account,
        liquidityDistribution: { ...derived.config.liquidityDistribution, partner: account },
      }
      setPreview(derived)
      setStep('preview')
    } catch (e) {
      setErr(`Preview failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function sendTx(tx: { to: Address; data: `0x${string}`; value?: bigint }): Promise<{ hash: `0x${string}`; block: bigint }> {
    const wc = getWalletClient()
    const hash = await wc.sendTransaction({ account: account as Address, chain: giwaSepolia, to: tx.to, data: tx.data, value: tx.value ?? 0n })
    setTxs((t) => [...t, hash])
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(`Transaction reverted: ${hash}`)
    await waitForHeadPast(receipt.blockNumber)
    return { hash, block: receipt.blockNumber }
  }

  async function doCreateConfig() {
    if (!preview || !account || !template) return
    setBusy(true)
    setErr('')
    try {
      const plan = await sdk.planCreateAmmoraV4Config(publicClient, REGISTRY, preview.config, preview.curve, account, account)
      const { hash, block } = await sendTx(plan.transaction)
      const receipt = await publicClient.getTransactionReceipt({ hash })
      const created = sdk.parseAmmoraV4ConfigCreatedReceipt(receipt, REGISTRY)
      if (created.configHash !== plan.simulatedConfigHash) throw new Error('Created Config hash does not match the preview — do not continue.')
      setConfigId(created.configId.toString())
      setConfigHash(created.configHash)
      setConfigTx(hash)
      setStep('launch')
      void block
    } catch (e) {
      setErr(`Config creation failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function doCreateLaunch() {
    if (!account || !template || !configId) return
    setBusy(true)
    setErr('')
    try {
      const built = sdk.buildCreateAmmoraV4Launch(
        {
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          metadataURI: metadataURI.trim(),
          creatorMetadataURI: '',
          tokenDecimals: decimals,
        },
        BigInt(configId),
        template.poolCreationFee,
      )
      const { hash } = await sendTx({ to: FACTORY, data: built.data, value: built.value })
      const receipt = await publicClient.getTransactionReceipt({ hash })
      const launch = sdk.parseAmmoraV4LaunchCreatedReceipt(receipt, FACTORY)
      setToken(launch.token)
      setCurve(launch.curve)
      setLaunchTx(hash)
      setStep('done')
      onLaunched(launch.token, launch.curve)
    } catch (e) {
      setErr(`Launch failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-xl font-bold">Launch Studio</h2>
        <p className="mt-1 text-sm text-slate-400">
          Create a reusable Config from a reviewed template, then issue your token on its bonding
          curve — all on GIWA Sepolia testnet. Template #6 is quarantined by Ammora and never
          offered here. Your wallet pays only testnet gas.
        </p>
        {!account && <div className="mt-3"><ErrorBox msg="Connect your wallet (top right) to launch." /></div>}
      </Card>

      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Template (reviewed, concentrated graduation)">
            <select
              className={inputCls}
              value={templateId}
              disabled={loadingTemplates || step !== 'idle'}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {loadingTemplates && <option>Loading templates…</option>}
              {templates.map((t) => (
                <option key={t.configId.toString()} value={t.configId.toString()}>
                  #{t.configId.toString()} — {formatUnits(t.totalSupply, t.tokenDecimals)} max supply · graduates at{' '}
                  {formatUnits(t.migrationQuoteThreshold, 18)} WETH
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Templates are read live from the Config registry. #6 is excluded ({BANNED_TEMPLATE_ID.toString()} = quarantined).
            </span>
          </Field>
          <Field label="Token metadata URI" hint="Stored on-chain with your token. Host your own JSON, or use the generic one.">
            <input className={inputCls} value={metadataURI} disabled={step !== 'idle'} onChange={(e) => setMetadataURI(e.target.value)} />
          </Field>
          <Field label="Token name">
            <input className={inputCls} value={name} disabled={step !== 'idle'} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Token" />
          </Field>
          <Field label="Symbol">
            <input className={inputCls} value={symbol} disabled={step !== 'idle'} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="e.g. MYT" />
          </Field>
          <Field label="Sale supply (tokens)" hint={`Token decimals: ${decimals} (from template).`}>
            <input className={inputCls} value={saleSupply} disabled={step !== 'idle'} onChange={(e) => setSaleSupply(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Graduation threshold (WETH)" hint="Quote the curve must raise before it migrates to a pool. Small = graduates fast.">
            <input className={inputCls} value={quoteThreshold} disabled={step !== 'idle'} onChange={(e) => setQuoteThreshold(e.target.value)} inputMode="decimal" />
          </Field>
        </div>
        <div className="mt-4">
          <Btn onClick={doPreview} disabled={busy || !account || step !== 'idle'}>
            {busy ? 'Working…' : '1 · Preview Config'}
          </Btn>
        </div>
      </Card>

      {preview && step !== 'idle' && (
        <Card>
          <h3 className="text-lg font-bold">Config preview — review before signing</h3>
          <div className="mt-3 grid gap-2 font-mono text-sm sm:grid-cols-2">
            <div>Total supply: <b>{formatUnits(preview.economics.totalSupplyRaw, decimals)} {symbol.toUpperCase()}</b></div>
            <div>Sale allocation: {formatUnits(preview.economics.saleAllocationRaw, decimals)}</div>
            <div>Migration base: {formatUnits(preview.economics.grossMigrationBaseRaw, decimals)}</div>
            <div>Migration quote: {formatUnits(preview.economics.grossMigrationQuoteRaw, 18)} WETH</div>
            <div>Migration fee: {formatUnits(preview.economics.migrationQuoteFeeRaw, 18)} WETH</div>
            <div>Locked base (vesting): {formatUnits(preview.economics.lockedBaseRaw, decimals)}</div>
            <div>Config owner: {shortAddr(account ?? '')}</div>
            <div>Partner / LP / leftover: {shortAddr(account ?? '')} (your wallet)</div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            All template fee rates, vesting schedules and LP ratios are inherited unchanged. Creating
            the Config is one transaction; issuing the token is a second one.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn onClick={doCreateConfig} disabled={busy || step !== 'preview'}>
              {busy && step === 'preview' ? 'Creating…' : '2 · Create Config on-chain'}
            </Btn>
            <Btn variant="ghost" onClick={() => { setStep('idle'); setPreview(null) }} disabled={busy}>Start over</Btn>
          </div>
          {configTx && (
            <div className="mt-3 text-sm">
              Config #{configId} created · hash <span className="font-mono text-xs">{configHash.slice(0, 18)}…</span> · <TxLink hash={configTx} label="config tx ↗" />
            </div>
          )}
          {step === 'launch' && (
            <div className="mt-4">
              <Btn onClick={doCreateLaunch} disabled={busy}>
                {busy ? 'Launching…' : '3 · Issue token + create curve'}
              </Btn>
            </div>
          )}
        </Card>
      )}

      {step === 'done' && token && curve && (
        <Card>
          <h3 className="text-lg font-bold text-emerald-300">🎉 {name.trim()} ({symbol.trim().toUpperCase()}) is live!</h3>
          <div className="mt-3 space-y-1 font-mono text-sm">
            <div>Token: <a className="text-accent underline" href={`https://sepolia-explorer.giwa.io/address/${token}`} target="_blank" rel="noreferrer">{token}</a></div>
            <div>Curve: <a className="text-accent underline" href={`https://sepolia-explorer.giwa.io/address/${curve}`} target="_blank" rel="noreferrer">{curve}</a></div>
            <div>Launch tx: <TxLink hash={launchTx} /></div>
            <div>Config: #{configId}</div>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            Next: buy your token on the curve in the Trade tab. Once the curve raises the graduation
            threshold it can migrate to a concentrated pool.
          </p>
          <div className="mt-3">
            <Btn onClick={() => onLaunched(token, curve)}>Open in Trade tab →</Btn>
          </div>
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
