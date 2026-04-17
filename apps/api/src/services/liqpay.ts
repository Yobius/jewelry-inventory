/**
 * LiqPay (ПриватБанк) client — signing, invoice URL, callback verification.
 *
 * Docs: https://www.liqpay.ua/documentation/en/api/aquiring/checkout
 *
 * LiqPay works like this:
 *   1. We build a JSON payload (version/public_key/action/amount/order_id/...).
 *   2. Encode it as base64 → `data`.
 *   3. Sign with `base64(sha1(private_key + data + private_key))` → `signature`.
 *   4. Client posts data+signature to https://www.liqpay.ua/api/3/checkout and
 *      lands on LiqPay page (with PrivatBank QR, Apple Pay, Google Pay, cards).
 *   5. On payment, LiqPay calls our `server_url` with the same data+signature.
 *      We verify signature, look up the order, mark paid.
 *
 * The `2fa_*` actions and recurring payments are out of scope here.
 */
import { createHash } from 'node:crypto'

const LIQPAY_CHECKOUT = 'https://www.liqpay.ua/api/3/checkout'

export type LiqPayKeys = {
  publicKey: string
  privateKey: string
  publicOrigin: string
}

export type InvoiceInput = {
  receiptId: string
  /** Amount in UAH, e.g. 1234.56 */
  amount: number
  description: string
  /** Where to return the buyer after payment. Usually POS receipt page. */
  resultUrl?: string
  /** Where LiqPay will POST async callback. MUST be publicly reachable. */
  serverUrl?: string
}

export type SignedRequest = {
  /** base64(JSON.stringify(payload)) */
  data: string
  /** base64(sha1(private_key + data + private_key)) */
  signature: string
  /** Endpoint URL the client (or iframe) should POST to. */
  actionUrl: string
}

export function sign(data: string, privateKey: string): string {
  return createHash('sha1').update(privateKey + data + privateKey).digest('base64')
}

export function encodePayload(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}

export function decodePayload<T = Record<string, unknown>>(dataBase64: string): T {
  return JSON.parse(Buffer.from(dataBase64, 'base64').toString('utf8')) as T
}

/** Build a signed request the POS UI can post to LiqPay. */
export function createInvoice(input: InvoiceInput, keys: LiqPayKeys): SignedRequest {
  const payload = {
    public_key: keys.publicKey,
    version: '3',
    action: 'pay',
    amount: input.amount.toFixed(2),
    currency: 'UAH',
    description: input.description,
    order_id: input.receiptId,
    result_url: input.resultUrl ?? `${keys.publicOrigin}/dashboard/pos?paid=${input.receiptId}`,
    server_url: input.serverUrl ?? `${keys.publicOrigin}/api/payments/liqpay/callback`,
    language: 'uk',
    // Only show PrivatBank / Apple Pay / Google Pay / card — no wire transfer
    paytypes: 'apay,gpay,card,privat24,liqpay',
  }
  const data = encodePayload(payload)
  const signature = sign(data, keys.privateKey)
  return { data, signature, actionUrl: LIQPAY_CHECKOUT }
}

/**
 * Verify a callback from LiqPay. Returns the decoded payload if signature is valid,
 * null otherwise.
 */
export function verifyCallback(
  data: string,
  signature: string,
  privateKey: string,
): LiqPayCallbackPayload | null {
  const expected = sign(data, privateKey)
  if (expected !== signature) return null
  return decodePayload<LiqPayCallbackPayload>(data)
}

/** Subset of fields LiqPay sends in callbacks. */
export type LiqPayCallbackPayload = {
  action: string
  payment_id: number | string
  status:
    | 'success'
    | 'failure'
    | 'error'
    | 'subscribed'
    | 'unsubscribed'
    | 'reversed'
    | 'processing'
    | 'wait_accept'
    | 'wait_secure'
    | 'wait_compensation'
    | 'wait_lc'
    | 'sandbox'
    | '3ds_verify'
    | string
  order_id: string
  amount: number
  currency: string
  description?: string
  err_code?: string
  err_description?: string
  public_key?: string
  transaction_id?: number
  sender_card_mask2?: string
  paytype?: string
}

export function isTerminalStatus(
  status: string,
): 'success' | 'failed' | 'pending' {
  if (status === 'success' || status === 'sandbox') return 'success'
  if (status === 'failure' || status === 'error' || status === 'reversed') return 'failed'
  return 'pending'
}
