import { useEffect, useState } from 'react'
import { formatUnits, type Address } from 'viem'
import {
  FEATURED_LAUNCH,
  curveClient,
  scanRecentLaunches,
  shortAddr,
  txLink,
  withRetry,
  type LaunchRow,
} from '../lib/ammora'
import { Btn, Card, ErrorBox, StatusBadge, inputCls } from './ui'

export default function Explorer({ onTrade }: { onTrade: (curve: Address) => void }) {
  const [status, setStatus] = useState<number | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [reserves, setReserves] = useState<{ base: string; quote: string } | null>(null)
  const [recent, setRecent] = useState<LaunchRow[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [lookup, setLookup] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    withRetry(async () => {
      const c = curveClient(FEATURED_LAUNCH.curve)
      const st = await c.getState()
      if (!alive) return
      setStatus(st.status)
      setProgress(
        st.migrationQuoteThreshold > 0n
          ? Number((st.quoteReserve * 10000n) / st.migrationQuoteThreshold)
          : 0,
      )
      setReserves({
        base: formatUnits(st.baseReserve, FEATURED_LAUNCH.decimals),
        quote: formatUnits(st.quoteReserve, 18),
      })
    }).catch((e) => alive && setErr(`Could not load GPAD curve state: ${(e as Error).message}`))
    return () => {
      alive = false
    }
  }, [])

  async function doScan() {
    setScanning(true)
    setErr('')
    try {
      const rows = await scanRecentLaunches(5000)
      setRecent(rows)
      if (!rows.length) setErr('No launches found in the last 5,000 blocks. Try the lookup below, or check back after a new launch.')
    } catch (e) {
      setErr(`Scan failed: ${(e as Error).message}`)
    } finally {
      setScanning(false)
    }
  }

  function doLookup() {
    const v = lookup.trim()
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) {
      setErr('Paste a valid curve address (0x… 40 hex chars).')
      return
    }
    onTrade(v as Address)
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">GiwaPad (GPAD) — our demo launch</h2>
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">LIVE PROOF</span>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Launched, traded and graduated through this very launchpad on GIWA Sepolia.
              Config #97 (from template #45) · 1,000 GPAD sold on the curve · migrated to a
              concentrated pool · creator + LP fees claimed on-chain.
            </p>
          </div>
          {status !== null && <StatusBadge status={status} />}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-ink p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Graduation progress</div>
            <div className="mt-1 text-lg font-bold">{progress === null ? '…' : `${(progress / 100).toFixed(1)}%`}</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-accent" style={{ width: `${progress === null ? 0 : progress / 100}%` }} />
            </div>
          </div>
          <div className="rounded-xl bg-ink p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Curve reserves</div>
            <div className="mt-1 font-mono text-sm">{reserves ? `${reserves.base} GPAD` : '…'}</div>
            <div className="font-mono text-sm text-slate-400">{reserves ? `${reserves.quote} WETH` : '…'}</div>
          </div>
          <div className="rounded-xl bg-ink p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Token / Curve / Pool</div>
            <div className="mt-1 space-y-0.5 font-mono text-xs">
              <a className="block text-accent underline" href={`https://sepolia-explorer.giwa.io/address/${FEATURED_LAUNCH.token}`} target="_blank" rel="noreferrer">Token {shortAddr(FEATURED_LAUNCH.token)}</a>
              <a className="block text-accent underline" href={`https://sepolia-explorer.giwa.io/address/${FEATURED_LAUNCH.curve}`} target="_blank" rel="noreferrer">Curve {shortAddr(FEATURED_LAUNCH.curve)}</a>
              <a className="block text-accent underline" href={`https://sepolia-explorer.giwa.io/address/${FEATURED_LAUNCH.pool}`} target="_blank" rel="noreferrer">Pool {shortAddr(FEATURED_LAUNCH.pool)}</a>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn onClick={() => onTrade(FEATURED_LAUNCH.curve)}>Trade GPAD</Btn>
          <Btn variant="ghost" onClick={() => window.open(txLink(FEATURED_LAUNCH.txs.launch), '_blank')}>Launch tx ↗</Btn>
          <Btn variant="ghost" onClick={() => window.open(txLink(FEATURED_LAUNCH.txs.migrate), '_blank')}>Migration tx ↗</Btn>
          <Btn variant="ghost" onClick={() => window.open(txLink(FEATURED_LAUNCH.txs.feeClaim), '_blank')}>Fee claim tx ↗</Btn>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-bold">Recent launches</h3>
        <p className="mt-1 text-sm text-slate-400">
          Scans the last 5,000 blocks for <span className="font-mono">LaunchCreated</span> events from the Ammora factory.
        </p>
        <div className="mt-3">
          <Btn onClick={doScan} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan recent launches'}</Btn>
        </div>
        {recent && (
          <div className="mt-4 space-y-2">
            {recent.length === 0 && <p className="text-sm text-slate-400">No launches in range.</p>}
            {recent.map((r) => (
              <div key={r.txHash} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink p-3">
                <div className="font-mono text-xs">
                  <div>Token <a className="text-accent underline" href={`https://sepolia-explorer.giwa.io/address/${r.token}`} target="_blank" rel="noreferrer">{shortAddr(r.token)}</a></div>
                  <div>Curve <a className="text-accent underline" href={`https://sepolia-explorer.giwa.io/address/${r.curve}`} target="_blank" rel="noreferrer">{shortAddr(r.curve)}</a></div>
                  <div className="text-slate-500">Config #{r.configId.toString()} · block {r.blockNumber.toString()} · by {shortAddr(r.creator)}</div>
                </div>
                <Btn variant="ghost" onClick={() => onTrade(r.curve)}>Trade</Btn>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-lg font-bold">Look up a curve</h3>
        <p className="mt-1 text-sm text-slate-400">Paste any Ammora launch-curve address to open it in the trading terminal.</p>
        <div className="mt-3 flex gap-2">
          <input className={inputCls} value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="0x… curve address" />
          <Btn onClick={doLookup}>Open</Btn>
        </div>
      </Card>

      {err && <ErrorBox msg={err} />}
      <p className="text-xs text-slate-500">
        Note: this explorer shows recent on-chain launches plus the verified GiwaPad demo. A full
        historical index is not bundled — use the lookup above for any older curve.
      </p>
    </div>
  )
}
