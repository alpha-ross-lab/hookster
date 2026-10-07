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

/** Send SOL to the treasury; returns the transaction signature (base58). */
export async function payTreasury(p: { cluster: string; rpc: string; from: string; to: string; lamports: number }): Promise<string> {
  const conn = new Connection(p.rpc, 'confirmed');
  const from = new PublicKey(p.from);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: from, blockhash, lastValidBlockHeight }).add(
    SystemProgram.transfer({ fromPubkey: from, toPubkey: new PublicKey(p.to), lamports: p.lamports }),
  );
  const sigBytes = await transact(async (w: Web3MobileWallet) => {
    // re-authorize in the same session (wallet shows a single approval)
    const a = await w.authorize({ identity: APP_IDENTITY, chain: chainOf(p.cluster) });
    const got = new PublicKey(Buffer.from(a.accounts[0].address, 'base64')).toBase58();
    if (got !== p.from) throw new Error('Wallet account changed. Reconnect.');
    const sigs = await w.signAndSendTransactions({ transactions: [tx] });
    return sigs[0];
  });
  // MWA returns base64 signature bytes
  const sig = bs58.encode(Buffer.from(sigBytes as string, 'base64'));
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed').catch(() => {});
  return sig;
}
