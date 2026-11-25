import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [copied, setCopied] = useState(false)
  const walletRef = useRef<HTMLDivElement>(null)

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

  const doCopy = useCallback(async () => {
    if (!account) return
    try {
      await navigator.clipboard.writeText(account)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }, [account])

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

  // Close the wallet popup on outside tap or Escape.
  useEffect(() => {
    if (!walletOpen) return
    const onDown = (e: MouseEvent) => {
      if (walletRef.current && !walletRef.current.contains(e.target as Node)) setWalletOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWalletOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
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
          <div className="relative shrink-0" ref={walletRef}>
            {account ? (
              <>
                <button
                  type="button"
                  onClick={() => setWalletOpen((o) => !o)}
                  className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 font-mono text-xs text-accent transition hover:bg-accent/20"
                >
                  {account.slice(0, 6)}…{account.slice(-4)}
                </button>
                {walletOpen && (
                  <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-line bg-card p-4 shadow-xl shadow-black/50">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Wallet</p>
                    <p className="mt-2 break-all font-mono text-xs text-slate-100">{account}</p>
                    <p className="mt-1 text-xs text-slate-400">GIWA Sepolia · chain 91342</p>
                    <div className="mt-4 flex gap-2">
                      <Btn variant="ghost" onClick={doCopy}>
                        {copied ? 'Copied' : 'Copy address'}
                      </Btn>
                      <Btn variant="danger" onClick={doDisconnect}>
                        Disconnect
                      </Btn>
                    </div>
                  </div>
                )}
              </>
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
