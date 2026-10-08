<!-- ПРОЕКТ: Hookster (хакатон Solana) — README.md в корне репозитория -->
# 🎣 Hookster — viral Shorts → your script, paid in SOL

Android app for the Solana Mobile Hackathon (CLOCK IN). Describe your business → the app finds YouTube Shorts that
blew up far above their channel's size, breaks down *why* they worked (hook, format, structure), and writes a
ready-to-shoot script for **your** niche. Usage is paid in "hooks" (credits) bought with SOL through
**Mobile Wallet Adapter**; every payment is verified on-chain by the server.

## How it works
1. **Connect** — MWA `authorize` (Phantom/Solflare on the phone). The wallet address is your account. 50 free hooks.
2. **Search** (30 hooks) — Gemini turns the niche into queries, YouTube Data API returns Shorts ≤ 90 s, ranked by views ÷ channel size (≥ 2×).
3. **Break down** (10) — hook, format, 5-step structure, why it went viral.
4. **Ideas** (first set free, re-roll 10, invent from scratch 15) for 10 s – 5 min videos.
5. **Script** (5) — hook text, storyboard with voice-over, caption, hashtags. Copy to clipboard.
6. **Buy hooks** — app builds a SystemProgram transfer to the treasury, wallet signs & sends (`signAndSendTransactions`),
   server calls `getTransaction` on Solana RPC and checks payer, destination, amount and success, then credits hooks.
   A signature can only be used once.

Cheapest stack: Gemini Flash-Lite, YouTube Data API free quota, free Node hosting, Solana devnet.

## Repo
- `server/` — Node 20+ / Express, no database (JSON file). `npm test` (9 tests).
- `app/` — Expo (React Native) + `@solana-mobile/mobile-wallet-adapter-protocol-web3js`. Needs a native build (not Expo Go).

## 1. Run the server
**Keys live in a Google Drive folder** (not in the code). Put three plain-text files into one Drive folder:
- `gemini_keys.txt` — one Gemini key per line (`AIza…`); a line starting with `sk-ant-` is used as the **Claude fallback** key (cheapest model, Haiku) when Gemini fails or its quota ends.
- `youtube_key.txt` — the YouTube Data API v3 key (one line).
Share the folder: "Anyone with the link → Viewer". The server reads it at start and every 10 minutes (change a key → no redeploy).
Server env vars: `DRIVE_FOLDER_ID` (the folder id), `DRIVE_API_KEY` (a Google API key with **Drive API** enabled — console.cloud.google.com → APIs → enable "Google Drive API" → Credentials → API key), `TREASURY_ADDRESS` (devnet wallet address that receives payments).
Env vars `GEMINI_API_KEYS`, `ANTHROPIC_API_KEY`, `YOUTUBE_API_KEY` still work as an alternative.
```
cd server && npm install
DRIVE_FOLDER_ID=... DRIVE_API_KEY=... TREASURY_ADDRESS=<devnet address> npm start
npm test
```
Deploy free: push repo to GitHub → render.com → New → Blueprint → pick the repo (`server/render.yaml`), fill `DRIVE_API_KEY` and `TREASURY_ADDRESS`.
Free Render sleeps when idle (first request ~30 s) and its disk is not permanent — balances reset on redeploy (fine for a demo).

## 2. Build the APK
Set the server URL in `app/eas.json` (`EXPO_PUBLIC_API_BASE`) — your Render URL.
```
cd app && npm install
npx eas-cli login
npx eas-cli build -p android --profile apk      # cloud build, free tier; download the .apk from the link
```
Local alternative (Android Studio + SDK): `EXPO_PUBLIC_API_BASE=https://... npx expo prebuild -p android && cd android && ./gradlew assembleRelease`.
Install the APK on an Android phone that has Phantom or Solflare **set to Devnet**; get test SOL at faucet.solana.com.

## Payments: SOL now, SKR planned
The current build accepts **SOL on devnet** (test mode), because devnet has no SKR token to test with. The release version will additionally accept **SKR** (SPL token) for credit packs: same flow, a token transfer instead of a SOL transfer, verified on-chain by the server the same way.

**Verified end to end:** connect with Mobile Wallet Adapter (`authorize`), pay with `signAndSendTransactions`, the server checks the transfer with `getTransaction` and credits the hooks. Tested on a Solana Seeker phone with its built-in wallet on devnet (see the demo video); also confirmed with Solflare. Known limitation: Phantom in Testnet mode did not complete the sign step over MWA in our tests, so use the Seeker wallet or Solflare for the devnet demo.

**Where to read the code:** wallet and payment flow in `app/src/wallet.ts`, payment check in `server/src/solana.js` (`verifyPayment`), tests with `cd server && npm test`.

## Security notes
Secrets live only on the server. Wallet is used for identification and payments only (no signature-based login in this MVP:
the `x-wallet` header identifies the account; a production version would sign a challenge with `signMessages`).
