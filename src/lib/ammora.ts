// GiwaPad — shared Ammora helpers (GIWA Sepolia, SDK 0.3.9, auto-route).
// All reads use a FRESH block number: the GIWA RPC can serve lagging heads and
// the SDK clients cache their authenticated head, so stale quotes will revert.
// Never import anything from the examples repo — this is our own code.
import { createPublicClient, http, type Address, type Hex, type PublicClient } from 'viem'
import * as sdk from '@ammora-protocol/sdk'

export const RPC_URL = 'https://sepolia-rpc.giwa.io'
export const EXPLORER_URL = 'https://sepolia-explorer.giwa.io'
export const CHAIN_ID = 91342

export const giwaSepolia = {
  id: 91342,
  name: 'GIWA Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'GIWA Sepolia Explorer', url: EXPLORER_URL } },
} as const

export const DEPLOYMENT = sdk.giwaSepoliaAutoRouteDeployment
export const FACTORY = DEPLOYMENT.contracts.launch.factory
export const REGISTRY = DEPLOYMENT.contracts.launch.configRegistry
export const FEE_POLICY = DEPLOYMENT.contracts.launch.feePolicy
export const GRADUATION_ADAPTER = DEPLOYMENT.contracts.launch.graduationAdapter
export const CONC_FACTORY = DEPLOYMENT.contracts.launch.concentratedFactory
export const CONC_MANAGER = DEPLOYMENT.contracts.launch.concentratedPositionManager
export const WETH = DEPLOYMENT.contracts.tokens.wrappedNative as Address
export const NATIVE_ROUTER = DEPLOYMENT.contracts.routers.native

/** Config #6 is quarantined by Ammora's graduation-readiness notice — never use it. */
export const BANNED_TEMPLATE_ID = 6n

export const publicClient: PublicClient = createPublicClient({
  chain: giwaSepolia,
  transport: http(RPC_URL),
})

export const txLink = (hash: string) => `${EXPLORER_URL}/tx/${hash}`
export const addressLink = (addr: string) => `${EXPLORER_URL}/address/${addr}`
export const shortAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

export function arlClientOptions() {
  return {
    deploymentSource: sdk.createAmmoraDeploymentSource([sdk.giwaSepoliaAutoRouteDeployment]),
    factoryProfiles: sdk.giwaSepoliaAutoRoutePoolProfiles,
  }
}

export function curveClient(curve: Address) {
  return new sdk.AmmoraV4LaunchCurveClient(publicClient, curve, {
    launchFactory: FACTORY,
    feePolicy: FEE_POLICY,
  })
}

export function arlClient(pool: Address) {
  return new sdk.DammV2Client(publicClient, pool, 'concentrated', CONC_FACTORY, CONC_MANAGER, arlClientOptions())
}

/** Fresh head, then a fresh client bound to it — the anti-stale-quote discipline. */
export async function freshBlock(): Promise<bigint> {
  return publicClient.getBlockNumber()
}

/** Wait until the RPC head is past `blockNumber` (lagging nodes serve old state). */
export async function waitForHeadPast(blockNumber: bigint, tries = 30, delayMs = 2000) {
  for (let i = 0; i < tries; i++) {
    const head = await publicClient.getBlockNumber()
    if (head > blockNumber + 1n) return head
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return publicClient.getBlockNumber()
}

/** Retry a read a few times — GIWA Sepolia RPC occasionally lags after new blocks. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 4, delayMs = 2500): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw last
}

// --- Runtime-only SDK helpers (present in 0.3.9 JS, missing from its .d.ts) ---
const sdkExtra = sdk as unknown as {
  buildSingleSegmentCurve: (
    startSqrtPrice: bigint,
    saleSupply: bigint,
    migrationQuoteThreshold: bigint,
  ) => readonly { lowerSqrtPrice: bigint; upperSqrtPrice: bigint; liquidity: bigint }[]
  concentratedDepositQuote: (
    range: { sqrtPriceX64: bigint; sqrtMinPriceX64: bigint; sqrtMaxPriceX64: bigint },
    params: { quoteAmount: bigint },
  ) => { baseAmount: bigint; quoteAmount: bigint; liquidity: bigint }
}

export type DerivedConfig = {
  config: Parameters<typeof sdk.planCreateAmmoraV4Config>[2]
  curve: readonly { lowerSqrtPrice: bigint; upperSqrtPrice: bigint; liquidity: bigint }[]
  economics: {
    saleAllocationRaw: bigint
    grossMigrationBaseRaw: bigint
    grossMigrationQuoteRaw: bigint
    migrationQuoteFeeRaw: bigint
    quoteSurplusToProtocolRaw: bigint
    lockedBaseRaw: bigint
    totalSupplyRaw: bigint
  }
}

/**
 * Derive a complete, registry-valid Config from a reviewed template.
 * Same derivation the official guide documents: single-segment curve from the
 * template's start price, migration reserves computed from the post-fee quote,
 * all template fee rates / vesting / LP ratios preserved. Recipients are set
 * by the caller afterwards (configOwner, partnerRecipient, liquidityPartner,
 * leftoverReceiver).
 */
export function deriveConfigFromTemplate(
  template: Awaited<ReturnType<typeof sdk.getAmmoraV4ConfigAtBlock>>,
  saleSupply: bigint,
  migrationQuoteThreshold: bigint,
): DerivedConfig {
  if (saleSupply <= 0n || migrationQuoteThreshold <= 0n) {
    throw new Error('Sale supply and quote threshold must be positive')
  }
  if (template.config.migrationMode !== 0) {
    throw new Error('This helper supports concentrated graduation templates only')
  }
  const curve = sdkExtra.buildSingleSegmentCurve(
    template.config.startSqrtPrice,
    saleSupply,
    migrationQuoteThreshold,
  )
  const segment = curve[0]
  if (!segment) throw new Error('Single-segment curve construction returned no segment')
  const range = {
    sqrtPriceX64: segment.upperSqrtPrice,
    sqrtMinPriceX64: segment.lowerSqrtPrice,
    sqrtMaxPriceX64: segment.upperSqrtPrice * 2n,
  }
  const quoteFee = migrationQuoteThreshold * BigInt(template.config.migrationQuoteFeeBps) / 10_000n
  const quoteAfterFee = migrationQuoteThreshold - quoteFee
  const destination = sdkExtra.concentratedDepositQuote(range, { quoteAmount: quoteAfterFee })
  const vesting = template.config.lockedBaseVesting
  const lockedBase = vesting.cliffUnlockAmount + vesting.amountPerPeriod * BigInt(vesting.numberOfPeriods)
  const config = {
    ...template.config,
    totalSupply: saleSupply + destination.baseAmount + lockedBase,
    migrationQuoteThreshold,
    migrationBaseThreshold: destination.baseAmount,
    postMigrationSqrtMinPrice: range.sqrtMinPriceX64,
    postMigrationSqrtMaxPrice: range.sqrtMaxPriceX64,
    postMigrationLiquidity: destination.liquidity,
  }
  sdk.assertAmmoraV4Config(config, curve)
  return {
    config,
    curve,
    economics: {
      saleAllocationRaw: saleSupply,
      grossMigrationBaseRaw: destination.baseAmount,
      grossMigrationQuoteRaw: destination.quoteAmount,
      migrationQuoteFeeRaw: quoteFee,
      quoteSurplusToProtocolRaw: quoteAfterFee - destination.quoteAmount,
      lockedBaseRaw: lockedBase,
      totalSupplyRaw: config.totalSupply,
    },
  }
}

export type TemplateRow = {
  configId: bigint
  configHash: Hex
  enabled: boolean
  owner: Address
  quoteToken: Address
  tokenDecimals: number
  totalSupply: bigint
  migrationMode: number
  migrationQuoteThreshold: bigint
  migrationBaseThreshold: bigint
  poolCreationFee: bigint
}

/** Live template catalog: enabled, WETH-quoted, concentrated, not #6. */
export async function listQualifiedTemplates(limit = 12): Promise<TemplateRow[]> {
  const block = await freshBlock()
  const nextId = await sdk.getAmmoraV4NextConfigId(publicClient, REGISTRY, block)
  const rows: TemplateRow[] = []
  for (let id = nextId - 1n; id >= 0n && rows.length < limit; id--) {
    try {
      const snap = await sdk.getAmmoraV4ConfigAtBlock(publicClient, REGISTRY, id, block)
      const c = snap.config
      if (!snap.enabled || id === BANNED_TEMPLATE_ID) continue
      if (c.quoteToken.toLowerCase() !== WETH.toLowerCase()) continue
      if (c.migrationMode !== 0) continue
      rows.push({
        configId: id,
        configHash: snap.configHash,
        enabled: snap.enabled,
        owner: snap.identity.owner,
        quoteToken: c.quoteToken,
        tokenDecimals: c.tokenDecimals,
        totalSupply: c.totalSupply,
        migrationMode: c.migrationMode,
        migrationQuoteThreshold: c.migrationQuoteThreshold,
        migrationBaseThreshold: c.migrationBaseThreshold,
        poolCreationFee: c.poolCreationFee,
      })
    } catch {
      // unreadable config — skip
    }
  }
  return rows
}

// --- LaunchCreated event (factory V3 ABI) for the Explorer scan ---
export const LAUNCH_CREATED_TOPIC =
  '0x0d8c51804d67b6aa256e855176d3b6f5d0cc3657138b63947cc9eb5a1908d00a' as Hex

export type LaunchRow = {
  token: Address
  curve: Address
  creator: Address
  configId: bigint
  blockNumber: bigint
  txHash: Hex
}

/** Scan recent blocks for LaunchCreated events (newest first). */
export async function scanRecentLaunches(blocks = 5000): Promise<LaunchRow[]> {
  const head = await freshBlock()
  const from = head > BigInt(blocks) ? head - BigInt(blocks) : 0n
  const logs = await withRetry(() =>
    publicClient.getLogs({
      address: FACTORY,
      event: {
        type: 'event',
        name: 'LaunchCreated',
        inputs: [
          { name: 'token', type: 'address', indexed: true },
          { name: 'curve', type: 'address', indexed: true },
          { name: 'creator', type: 'address', indexed: true },
          { name: 'configId', type: 'uint256', indexed: false },
          { name: 'configHash', type: 'bytes32', indexed: false },
          { name: 'protocolVersion', type: 'uint16', indexed: false },
          { name: 'metadataURI', type: 'string', indexed: false },
        ],
      } as const,
      fromBlock: from,
      toBlock: head,
    }),
  )
  return logs
    .map((l) => ({
      token: l.args.token as Address,
      curve: l.args.curve as Address,
      creator: l.args.creator as Address,
      configId: l.args.configId as bigint,
      blockNumber: l.blockNumber,
      txHash: l.transactionHash,
    }))
    .reverse()
}

// --- Featured demo launch: GiwaPad (GPAD), launched + graduated by GiwaPad itself ---
export const FEATURED_LAUNCH = {
  name: 'GiwaPad',
  symbol: 'GPAD',
  decimals: 9,
  configId: '97',
  templateId: '45',
  token: '0x4323B63F87bE2E3916DcbC3f33Ef4d9BB3252713' as Address,
  curve: '0xFe0f5ae0beD24C926f94447758838c61c9BA3503' as Address,
  pool: '0x9a10CbA9f8ebD9AD6d9ea541E8e82EeEa4f3822e' as Address,
  feeVault: '0x414Be4a093fDFd7292dCa95C4D6fdD3905Ee6800' as Address,
  txs: {
    wrap: '0xcc8488330802a7d4ad9e00495a0c55d5b434180594e545045e7e97038f521751',
    config: '0xcba61ce61eb04e282222bbd7abe6474ed5560636465f2c00f3ed0d8b6f77ebc2',
    launch: '0xe85693c802bfea6ef126365eb656d498ba1ba24db10ec597df974018bec99425',
    buy1: '0x56fcf0edf58ec589ebf426af27a2a731c280acee436f4740fd36c2a651a1e7d2',
    buy2: '0xe3d5f80328582b24616a085a4b228b30a76cd4fa24fbef25ce9f74f64a90cf0d',
    migrate: '0x3d942e85bc529ddf0ee9e501054d942236ae92a955a9f76837dcc15a48cccccf',
    postBuy: '0x452d8de66b75823dde85447625dbd24ecb966246692f49ec84a20ec010d51446',
    postSell: '0xe3882926f22b6030145ccc5e69ee737158e297c0a72623e89a07d1aa2c973212',
    feeClaim: '0x6b6b0a88e5563ba17b6d8aad2cfa0c508b78586e0bef38e406a4703bc3057ad6',
    lpClaim160: '0x32073774dabcb46a39c74b6ffd65e501d9d850ade88295d08ada79e803d89e53',
    lpClaim161: '0x8b5bf7ebab1cbbd9d93592a27e0360022f3ed0ef62acd9adc18ab91c3e91c9ea',
    lpClaim162: '0x1abb911c0574abc9eceb67975656c8d4924e22c5d8a673e8db6787bab552519a',
  },
}
