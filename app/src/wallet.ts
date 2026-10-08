// ПРОЕКТ: Hookster (хакатон Solana) — app/src/wallet.ts
import { transact, Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
import { APP_IDENTITY } from './config';

const chainOf = (cluster: string) => (cluster === 'mainnet-beta' ? 'solana:mainnet' : 'solana:devnet');

export async function connectWallet(cluster: string): Promise<{ address: string; authToken: string }> {
  return transact(async (w: Web3MobileWallet) => {
    const a = await w.authorize({ identity: APP_IDENTITY, chain: chainOf(cluster) });
    const address = new PublicKey(Buffer.from(a.accounts[0].address, 'base64')).toBase58();
    return { address, authToken: a.auth_token };
  });
}

const FEE_BUFFER = 10000; // lamports kept for the network fee

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timed out. Check the connection and try again.`)), ms);
    p.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });
}

// The web3js wrapper already returns base58 signatures; accept raw base64 too, just in case.
function toBase58Signature(s: string): string {
  try { if (bs58.decode(s).length === 64) return s; } catch { /* not base58 */ }
  const raw = Buffer.from(s, 'base64');
  if (raw.length === 64) return bs58.encode(raw);
  throw new Error('Unexpected signature format from the wallet.');
}

function friendly(e: any): Error {
  const m = String(e?.message ?? e);
  if (/cancel|declin|reject|denied/i.test(m)) {
    return new Error('Payment was cancelled in the wallet. Check that the wallet is in Testnet mode and has enough SOL, then try again.');
  }
  return e instanceof Error ? e : new Error(m);
}

/** Send SOL to the treasury; returns the transaction signature (base58). */
export async function payTreasury(p: { cluster: string; rpc: string; from: string; to: string; lamports: number; onStep?: (s: string) => void }): Promise<string> {
  const step = (s: string) => { try { p.onStep?.(s); } catch { /* ignore */ } };
  const conn = new Connection(p.rpc, 'confirmed');
  const from = new PublicKey(p.from);

  // Fail early with a clear message instead of a wallet-side error.
  step('1/4 Checking balance…');
  const balance = await withTimeout(conn.getBalance(from), 15000, 'Balance check');
  if (balance < p.lamports + FEE_BUFFER) {
    const have = (balance / 1e9).toFixed(4);
    const need = ((p.lamports + FEE_BUFFER) / 1e9).toFixed(4);
    throw new Error(`Not enough ${p.cluster === 'mainnet-beta' ? '' : 'devnet '}SOL in this wallet: ${have} SOL, need about ${need} SOL. Switch the wallet to Testnet mode or top it up.`);
  }

  step('2/4 Preparing transaction…');
  const { blockhash, lastValidBlockHeight } = await withTimeout(conn.getLatestBlockhash(), 15000, 'Network');
  const tx = new Transaction({ feePayer: from, blockhash, lastValidBlockHeight }).add(
    SystemProgram.transfer({ fromPubkey: from, toPubkey: new PublicKey(p.to), lamports: p.lamports }),
  );

  let sig: string;
  try {
    // Standard path: the wallet signs and sends the transaction itself.
    step('3/4 Opening wallet… confirm the payment there');
    const sigBytes = await transact(async (w: Web3MobileWallet) => {
      const a = await w.authorize({ identity: APP_IDENTITY, chain: chainOf(p.cluster) });
      const got = new PublicKey(Buffer.from(a.accounts[0].address, 'base64')).toBase58();
      if (got !== p.from) throw new Error('Wallet account changed. Reconnect.');
      const sigs = await w.signAndSendTransactions({ transactions: [tx] });
      return sigs[0];
    });
    sig = toBase58Signature(sigBytes as unknown as string);
  } catch (e1: any) {
    if (/cancel|declin|reject|denied/i.test(String(e1?.message ?? e1))) throw friendly(e1);
    // Fallback: the wallet only signs, the app sends the signed transaction.
    step('3/4 Opening wallet again…');
    try {
      const signed = await transact(async (w: Web3MobileWallet) => {
        const a = await w.authorize({ identity: APP_IDENTITY, chain: chainOf(p.cluster) });
        const got = new PublicKey(Buffer.from(a.accounts[0].address, 'base64')).toBase58();
        if (got !== p.from) throw new Error('Wallet account changed. Reconnect.');
        const out = await w.signTransactions({ transactions: [tx] });
        return out[0];
      });
      sig = await conn.sendRawTransaction(signed.serialize());
    } catch (e2: any) {
      throw friendly(e2);
    }
  }
  step('4/4 Confirming on-chain…');
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed').catch(() => {});
  return sig;
}
