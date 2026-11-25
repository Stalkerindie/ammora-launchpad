import { useCallback, useState } from 'react'
import type { Address } from 'viem'
import { FEATURED_LAUNCH } from './lib/ammora'
import { connectWallet, hasInjectedWallet } from './lib/wallet'
import Explorer from './components/Explorer'
import LaunchStudio from './components/LaunchStudio'
import Trading from './components/Trading'
import Fees from './components/Fees'
import { Btn } from './components/ui'

type Tab = 'explore' | 'launch' | 'trade' | 'fees'

export default function App() {
  const [tab, setTab] = useState<Tab>('explore')
  const [account, setAccount] = useState<Address | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connectErr, setConnectErr] = useState('')
  const [curve, setCurve] = useState<Address>(FEATURED_LAUNCH.curve)

  const doConnect = useCallback(async () => {
    setConnectErr('')
    if (!hasInjectedWallet()) {
      setConnectErr('No injected wallet found. Open this page in a browser with MetaMask (or Quetta) installed.')
      return
    }
    setConnecting(true)
    try {
      const addr = await connectWallet()
      setAccount(addr)
    } catch (e) {
      setConnectErr((e as Error).message)
    } finally {
      setConnecting(false)
    }
  }, [])

  const goTrade = useCallback((curveAddr: Address) => {
    setCurve(curveAddr)
    setTab('trade')
  }, [])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'explore', label: 'Explorer' },
    { id: 'launch', label: 'Launch Studio' },
    { id: 'trade', label: 'Trade' },
    { id: 'fees', label: 'Fees' },
  ]

  return (
    <div className="min-h-screen bg-ink text-slate-100">
      <header className="sticky top-0 z-10 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              Giwa<span className="text-accent">Pad</span>
            </h1>
            <p className="text-xs text-slate-400">Ammora SDK · GIWA Sepolia testnet</p>
          </div>
          <div className="flex items-center gap-2">
            {account ? (
              <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 font-mono text-xs text-accent">
                {account.slice(0, 6)}…{account.slice(-4)}
              </span>
            ) : (
              <Btn onClick={doConnect} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect Wallet'}
              </Btn>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 px-4 pb-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                tab === t.id ? 'bg-accent text-ink' : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {connectErr && (
        <div className="mx-auto mt-3 max-w-5xl px-4">
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{connectErr}</div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6">
        {tab === 'explore' && <Explorer onTrade={goTrade} />}
        {tab === 'launch' && <LaunchStudio account={account} onLaunched={goTrade} />}
        {tab === 'trade' && <Trading account={account} curve={curve} onCurveChange={setCurve} />}
        {tab === 'fees' && <Fees account={account} />}
      </main>

      <footer className="border-t border-line py-5">
        <div className="mx-auto max-w-5xl px-4 text-center text-xs text-slate-500">
          <p>
            Built with <span className="text-slate-300">@ammora-protocol/sdk 0.3.9</span> on GIWA Sepolia (chain 91342) ·
            Testnet only — no real funds · Template #6 is quarantined and never offered.
          </p>
          <p className="mt-1">
            Demo launch: GPAD 0x4323B63F87bE2E3916DcbC3f33Ef4d9BB3252713 · Curve 0xFe0f5ae0beD24C926f94447758838c61c9BA3503 ·
            Pool 0x9a10CbA9f8ebD9AD6d9ea541E8e82EeEa4f3822e
          </p>
        </div>
      </footer>
    </div>
  )
}
