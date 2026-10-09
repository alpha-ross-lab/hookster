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

## Mobile Wallet Adapter flow (what the code does)
1. `connectWallet()` in `app/src/wallet.ts` calls `transact` + `authorize({identity, chain})`; the wallet address becomes the account.
2. `payTreasury()` checks the balance first (clear error if SOL is missing), builds a SystemProgram transfer to the treasury, then calls `signAndSendTransactions()`. If the wallet only signs, it falls back to `signTransactions()` and sends the transaction itself.
3. Failure handling: a cancelled payment shows "Payment was cancelled in the wallet"; network calls time out after 15 s with a named step; a wrong wallet account is rejected.
4. `verifyPayment()` in `server/src/solana.js` calls `getTransaction`, checks sender, treasury and amount, and only then credits the hooks (each signature can be used once).

## Sample output (real run from the demo video)
Niche: "Yoga studio". Source Short: "Try this steps for back bend" by The Flax Monk, 26.9M views, 26 s, 387x channel size.

**Hook:** the video immediately presents a striking visual challenge and promises a quick, actionable solution for a difficult yoga pose.
**Format:** tutorial demonstration.
**Structure:** 1 The Problem (a rigid posture when attempting a backbend), 2 The Promise (a breakthrough technique), 3 Step One (preparatory movement), 4 Progression (deeper phase of the stretch), 5 Final Result (the completed backbend as a payoff).
**Why it went viral:** high visual appeal for a universal goal (flexibility); a 26-second length that encourages looping; views of about 400x the channel size; a broad audience from beginners to intermediate; a wordless demonstration that works in any language.

Hookster then turns this structure into new video ideas and a timed script for the creator's own studio, instead of generating generic text from nothing.

### Second breakdown sample (niche "beat maker")
Source Short: "FL 2006 beat" by Ara5Love music, 9.0M views, 57 s, 222.1x channel size.

**Hook:** the video immediately capitalizes on intense nostalgia by showing an ancient version of FL Studio combined with a modern "speedrun" challenge. This unusual pairing instantly grabs the viewer's curiosity within the first few seconds.
**Format:** nostalgic beat-making speedrun.
**Structure:** 1 Nostalgic Setup (launching an extremely outdated FL Studio from 2006), 2 The Challenge (a speedrun timer sets the rule: a full beat under extreme software limitations), 3 Rapid Workflow (fast clicking and MIDI placement), 4 Retro Sound Design (classic 2000s stock plugins and sounds layered quickly), 5 Final Reveal (the finished beat plays back, proving that skill matters more than the newest plugins).
**Why it went viral:** extreme software nostalgia, which naturally triggers comments and shares.

## Results across other niches (real runs on the Seeker phone)
The same search was run for three more, very different niche descriptions ("solana seeker", "web developer", "beat maker"). Each run costs 30 hooks, and every card shows how many times the Short beat its own channel size.

| Niche typed in the app | Source Short (channel, views, length) | Channel-size multiple |
|---|---|---|
| "solana seeker" | "PSG1 - Solana Gaming Gear Unboxing" (Niqz, 2K views, 32 s) | 3.5x |
| "solana seeker" | "Solana Seeker Phone unbox" (Solana Mania, 2K views, 51 s) | 3.2x |
| "web developer" | "Manager / programmers life / chatgpt" (Comp Tech Edu, 672K views, 18 s) | 74.2x |
| "web developer" | "Vida de programador" (olDie_animation, 28K views, 15 s) | 55.3x |
| "beat maker" | "FL 2006 beat" (Ara5Love music, 9.0M views, 57 s) | 222.1x |
| "beat maker" | "BEAT MEME REMIX" (WORST pLAYEr, 18.0M views, 15 s) | 65.7x |

A small niche ("solana seeker") gives modest multiples (about 3x), larger niches ("web developer", "beat maker") give tens to hundreds. The score is relative to the channel's own size, not raw views, so a 2K-view Short from a tiny channel can qualify. Each result can be opened with "Break down" (10 hooks) to get the hook, format and structure, as in the sample above.

## Security notes
Secrets live only on the server. Wallet is used for identification and payments only (no signature-based login in this MVP:
the `x-wallet` header identifies the account; a production version would sign a challenge with `signMessages`).

**Known findings from the hackathon security audit (and what we did):**
- Opening links: the app now opens only `https://` YouTube links received from the server (`openSafe` in `app/App.tsx`).
- Cleartext endpoint: removed the `http://` development fallback; the default server URL is HTTPS.
- Dependencies: the remaining advisories are transitive build-time packages of Expo tooling and `@solana/web3.js` v1 (via `jayson`/`uuid`); they are not shipped as app logic. Plan: move to the newer Solana client library and update Expo after the hackathon.
- Authentication: accounts are identified by wallet address, not by a signed message yet (roadmap: `signMessages` challenge).
