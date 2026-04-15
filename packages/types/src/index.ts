/** JSON payload types mirroring Prisma `Json` columns. */

export type ItemSpecs = {
  width?: number
  height?: number
  depth?: number
  tags: string[]
}

export type ItemPricing = {
  /** Base unit price in UAH (stored as string to preserve Decimal precision). */
  unitPrice: string
  /** Price per gram in UAH. */
  perGram: string
}

export type ItemIdentification = {
  qrCode: string
  barcode?: string
}

export type LocationQuantities = {
  warehouse: number
  point1: number
  point2: number
  point3: number
}

export type TransactionMovement = {
  from?: string
  to?: string
}

export type UserLocationFlags = {
  warehouse?: boolean
  point1?: boolean
  point2?: boolean
  point3?: boolean
}

export const ZERO_QUANTITIES: LocationQuantities = {
  warehouse: 0,
  point1: 0,
  point2: 0,
  point3: 0,
}
