export type LocationKey = 'warehouse' | 'point1' | 'point2' | 'point3'

export type Quantities = Record<LocationKey, number>

export type Material = 'GOLD' | 'SILVER' | 'PLATINUM' | 'OTHER'

export type Item = {
  id: string
  sku: string
  name: string
  category: string | null
  specs: { tags?: string[]; width?: number; height?: number; depth?: number }
  material: Material
  /** Проба / fineness: 585, 750, 925, 999… */
  carat: number | null
  weight: string
  pricing: { unitPrice: string; perGram: string }
  identification: { qrCode: string; barcode?: string }
  inventory?: { quantities: Partial<Quantities> } | null
  createdAt: string
  updatedAt: string
}

export type ItemsListResponse = { items: Item[]; total: number }

export type TransactionType = 'IN' | 'OUT' | 'MOVE' | 'ADJUSTMENT'

export type Transaction = {
  id: string
  itemId: string
  type: TransactionType
  quantity: number
  movement: { from?: LocationKey; to?: LocationKey }
  reason: string | null
  createdAt: string
  item?: { id: string; sku: string; name: string }
}

export type TransactionsListResponse = { transactions: Transaction[] }
