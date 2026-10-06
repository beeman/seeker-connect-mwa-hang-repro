// Repro-only: call the Seeker Connect wallet's `solana:signAndSendTransaction` directly, so the
// wallet (not the app) submits the transaction. Triggered from the button in `public/repro.js`.
import { getAddMemoInstruction } from '@solana-program/memo'
import {
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createNoopSigner,
  createSolanaRpc,
  createTransactionMessage,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit'
import { getWallets } from '@wallet-standard/app'

declare global {
  interface Window {
    __reproLog: (msg: string) => void
    __reproSignAndSend: () => Promise<void>
  }
}

window.__reproSignAndSend = async () => {
  const log = window.__reproLog
  const wallet = getWallets()
    .get()
    .find((w) => /seeker/i.test(w.name))
  const account = wallet?.accounts[0]
  if (!wallet || !account) return log('connect with Seeker first')

  // Fresh blockhash right before the call: the 31s drop plus approval eats most of its lifetime.
  const rpc = createSolanaRpc('https://api.devnet.solana.com')
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send()
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(createNoopSigner(address(account.address)), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstruction(getAddMemoInstruction({ memo: 'seeker-connect repro: landed but hung' }), m),
  )
  const transaction = new Uint8Array(getTransactionEncoder().encode(compileTransaction(message)))

  log(`calling signAndSendTransaction as ${account.address.slice(0, 6)}…`)
  const feature = wallet.features['solana:signAndSendTransaction'] as {
    signAndSendTransaction: (input: object) => Promise<{ signature: Uint8Array }[]>
  }
  feature
    .signAndSendTransaction({ account, chain: 'solana:devnet', transaction })
    .then((r) => log(`RESOLVED, signature bytes=${r[0]?.signature.length}`))
    .catch((e: unknown) => log(`REJECTED: ${e instanceof Error ? e.message : String(e)}`))
}
