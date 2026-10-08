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

function friendly(e: any): Error {
  const m = String(e?.message ?? e);
  if (/cancel|declin|reject|denied/i.test(m)) {
    return new Error('Payment was cancelled in the wallet. Check that the wallet is in Testnet mode and has enough SOL, then try again.');
  }
  return e instanceof Error ? e : new Error(m);
}

/** Send SOL to the treasury; returns the transaction signature (base58). */
export async function payTreasury(p: { cluster: string; rpc: string; from: string; to: string; lamports: number }): Promise<string> {
  const conn = new Connection(p.rpc, 'confirmed');
  const from = new PublicKey(p.from);

  // Fail early with a clear message instead of a wallet-side error.
  const balance = await conn.getBalance(from);
  if (balance < p.lamports + FEE_BUFFER) {
    const have = (balance / 1e9).toFixed(4);
    const need = ((p.lamports + FEE_BUFFER) / 1e9).toFixed(4);
    throw new Error(`Not enough ${p.cluster === 'mainnet-beta' ? '' : 'devnet '}SOL in this wallet: ${have} SOL, need about ${need} SOL. Switch the wallet to Testnet mode or top it up.`);
  }

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: from, blockhash, lastValidBlockHeight }).add(
    SystemProgram.transfer({ fromPubkey: from, toPubkey: new PublicKey(p.to), lamports: p.lamports }),
  );

  let sig: string;
  try {
    // Standard path: the wallet signs and sends the transaction itself.
    const sigBytes = await transact(async (w: Web3MobileWallet) => {
      const a = await w.authorize({ identity: APP_IDENTITY, chain: chainOf(p.cluster) });
      const got = new PublicKey(Buffer.from(a.accounts[0].address, 'base64')).toBase58();
      if (got !== p.from) throw new Error('Wallet account changed. Reconnect.');
      const sigs = await w.signAndSendTransactions({ transactions: [tx] });
      return sigs[0];
    });
    sig = bs58.encode(Buffer.from(sigBytes as string, 'base64'));
  } catch (e1: any) {
    if (/cancel|declin|reject|denied/i.test(String(e1?.message ?? e1))) throw friendly(e1);
    // Fallback: the wallet only signs, the app sends the signed transaction.
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
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed').catch(() => {});
  return sig;
}
