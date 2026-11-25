# GiwaPad — Ammora Launchpad on GIWA Sepolia

A full launchpad built with **@ammora-protocol/sdk 0.3.9** on **GIWA Sepolia testnet**
(chain 91342). Not a mock: every feature below was proven end-to-end with real
testnet transactions before this page went live.

**Live site:** https://stalkerindie.github.io/ammora-launchpad/

## What it does

- **Explorer** — featured demo launch (GPAD) with live curve status, a scan of recent
  on-chain launches, and lookup by curve address.
- **Launch Studio** — pick a reviewed Config template (live from the registry), preview
  the derived economics, create a Config, then issue a token on its bonding curve.
  Template #6 is quarantined by Ammora and is never offered.
- **Trade** — live quotes and buy/sell on the bonding curve (ALC), one-click migration
  when the curve is ready, and trading on the concentrated pool (ARL) after graduation.
  Quotes are re-taken fresh at the latest block before signing — stale quotes revert.
- **Fees** — claim Creator/Partner fees from the FeeVault, and LP fees for a
  concentrated-position NFT.

## Proven on-chain (GIWA Sepolia, testnet)

Demo token **GiwaPad (GPAD)** `0x4323B63F87bE2E3916DcbC3f33Ef4d9BB3252713` · 9 decimals

| Step | Tx |
| --- | --- |
| Config #97 created (from template #45) | `0xe305135a2f2915f7cc04d4fdec1c98758c00985c8ee1122ea264aeb19fa92747` |
| Launch GPAD (token + curve) | `0xe85693c802bfea6ef126365eb656d498ba1ba24db10ec597df974018bec99425` |
| Buy 1 — 500,000,000,000 wei WETH in → 980,003,959,611 GPAD out | `0x56fcf0edf58ec589ebf426af27a2a731c280acee436f4740fd36c2a651a1e7d2` |
| Buy 2 — curve reached ReadyToMigrate | `0xe3d5f80328582b24616a085a4b228b30a76cd4fa24fbef25ce9f74f64a90cf0d` |
| Migrate → pool `0x9a10CbA9f8ebD9AD6d9ea541E8e82EeEa4f3822e` | `0x3d942e85bc529ddf0ee9e501054d942236ae92a955a9f76837dcc15a48cccccf` |
| Post-graduation buy (pool) | `0x452d8de66b75823dde85447625dbd24ecb966246692f49ec84a20ec010d51446` |
| Post-graduation sell (pool) | `0xe3882926f22b6030145ccc5e69ee737158e297c0a72623e89a07d1aa2c973212` |
| FeeVault WETH claim (8,080,808,082 wei) | `0x6b6b0a88e5563ba17b6d8aad2cfa0c508b78586e0bef38e406a4703bc3057ad6` |
| LP fee claim, NFT #160 | `0x32073774dabcb46a39c74b6ffd65e501d9d850ade88295d08ada79e803d89e53` |
| LP fee claim, NFT #162 | `0x1abb911c0574abc9eceb67975656c8d4924e22c5d8a673e8db6787bab552519a` |

Explorer: https://sepolia-explorer.giwa.io

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # outputs dist/
```

Connect any injected wallet (MetaMask / Quetta / Trust Wallet browser) and switch to
GIWA Sepolia (chain 91342, RPC https://sepolia-rpc.giwa.io). Testnet only — no real funds.

## Deploy

`npm run build`, then publish `dist/` to the `gh-pages` branch. GitHub Pages serves it at
https://stalkerindie.github.io/ammora-launchpad/ (Vite `base: /ammora-launchpad/`).

## Draft X post (for the Ammora builder submission)

```
I built GiwaPad — a full launchpad on @AmmoraProtocol SDK + GIWA Sepolia testnet 🚀

Explore launches, create your own token, trade the bonding curve, migrate to a pool & claim fees — all on-chain, end-to-end tested.

Try it: https://stalkerindie.github.io/ammora-launchpad/

#GIWA #Ammora #BUIDL
```

## Notes

- Config #6 (registry `0x6d043014972b87406C4757a5f2d655A24e0b0aF9`, hash
  `0x60489087…`) is quarantined — never used, never offered in the UI.
- LP fee claim for NFT #161 paid 0 (dust position, liquidity 1) — expected, not a bug.
- The demo GPAD metadata lives at `public/gpad.json`; new launches can point their
  metadata URI anywhere.
