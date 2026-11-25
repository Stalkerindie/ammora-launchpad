import { useCallback, useEffect, useState } from 'react'
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
  const [walletOpen, setWalletOpen] = useState(false)

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

  const doDisconnect = useCallback(() => {
    // Injected providers expose no disconnect RPC: disconnecting means the
    // app forgets the account. The wallet itself may still list this site
    // as connected until revoked inside the wallet.
    setAccount(null)
    setConnectErr('')
    setWalletOpen(false)
  }, [])


  // Follow the wallet: if the user switches or disconnects accounts in
  // MetaMask/Quetta, the header follows without a reload.
  useEffect(() => {
    const eth = window.ethereum
    if (!eth?.on) return
    const onAccountsChanged = (...args: unknown[]) => {
      const addrs = args[0] as string[]
      if (!addrs?.length) setAccount(null)
      else setAccount(addrs[0] as Address)
    }
    eth.on('accountsChanged', onAccountsChanged)
    return () => eth.removeListener?.('accountsChanged', onAccountsChanged)
  }, [])

  // Close the wallet popup on Escape (taps outside close via the backdrop).
  useEffect(() => {
    if (!walletOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWalletOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [walletOpen])

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
        <div className="mx-auto flex max-w-5xl flex-nowrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0 shrink">
            <h1 className="text-xl font-black tracking-tight sm:text-2xl">
              Giwa<span className="text-accent">Pad</span>
            </h1>
            <p className="hidden text-xs text-slate-400 sm:block">Ammora SDK · GIWA Sepolia testnet</p>
          </div>
          <div className="shrink-0">
            {account ? (
              <button
                type="button"
                onClick={() => setWalletOpen((o) => !o)}
                className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 font-mono text-xs text-accent transition hover:bg-accent/20"
              >
                {account.slice(0, 6)}…{account.slice(-4)}
              </button>
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

      {account && walletOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setWalletOpen(false)} />
          <div className="relative w-full max-w-sm rounded-3xl border border-line bg-card p-6 shadow-2xl shadow-black/50">
            <div className="flex items-start justify-between">
              <span className="rounded-2xl border border-line bg-white/5 p-3 text-slate-200">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                  <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                  <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                </svg>
              </span>
              <button
                type="button"
                onClick={() => setWalletOpen(false)}
                aria-label="Close"
                className="rounded-xl border border-line bg-white/5 p-2 text-slate-300 transition hover:bg-white/10"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <h2 className="mt-5 text-2xl font-bold text-slate-100">Your wallet</h2>
            <p className="mt-2 break-all font-mono text-sm text-slate-400">{account}</p>
            <button
              type="button"
              onClick={doDisconnect}
              className="mt-6 w-full rounded-full bg-white py-3.5 text-base font-semibold text-black transition hover:bg-slate-200"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={() => setWalletOpen(false)}
              className="mt-2 w-full py-2 text-sm font-medium text-slate-400 transition hover:text-slate-200"
            >
              Close
            </button>
          </div>
        </div>
      )}

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
