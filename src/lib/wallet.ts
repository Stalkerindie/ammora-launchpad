// Injected-wallet connection (MetaMask / Quetta / Trust Wallet browser).
// No WalletConnect project id needed; the user signs every transaction
// themselves in their own wallet. Nothing here ever touches a seed or key.
import { createWalletClient, custom, type Address, type WalletClient } from 'viem'
import { giwaSepolia, CHAIN_ID } from './ammora'

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      on?: (event: string, cb: (...args: unknown[]) => void) => void
      removeListener?: (event: string, cb: (...args: unknown[]) => void) => void
      isMetaMask?: boolean
    }
  }
}

export function hasInjectedWallet(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum
}

export function getWalletClient(): WalletClient {
  if (!window.ethereum) throw new Error('No injected wallet found. Open this page in a browser with MetaMask (or Quetta) installed.')
  return createWalletClient({ chain: giwaSepolia, transport: custom(window.ethereum) })
}

export async function connectWallet(): Promise<Address> {
  const wc = getWalletClient()
  const addresses = await wc.requestAddresses()
  if (!addresses.length) throw new Error('Wallet returned no accounts. Unlock it and try again.')
  await ensureGiwaChain()
  return addresses[0]
}

export async function ensureGiwaChain(): Promise<void> {
  const eth = window.ethereum
  if (!eth) return
  const chainIdHex = await eth.request({ method: 'eth_chainId' }) as string
  if (parseInt(chainIdHex, 16) === CHAIN_ID) return
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x164ce' }] })
  } catch (e: unknown) {
    const err = e as { code?: number }
    if (err.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x164ce',
          chainName: 'GIWA Sepolia',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://sepolia-rpc.giwa.io'],
          blockExplorerUrls: ['https://sepolia-explorer.giwa.io'],
        }],
      })
    } else {
      throw new Error('Please switch your wallet to GIWA Sepolia (chain 91342) and try again.')
    }
  }
}

/** Wrap native ETH into WETH (WETH deposit). Returns the tx hash. */
export async function wrapEth(account: Address, amountWei: bigint): Promise<`0x${string}`> {
  const wc = getWalletClient()
  const { WETH } = await import('./ammora')
  return wc.sendTransaction({
    account,
    chain: giwaSepolia,
    to: WETH,
    data: '0xd0e30db0',
    value: amountWei,
  })
}
