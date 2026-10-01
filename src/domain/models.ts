export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'asset_purchase'
  | 'liability'
  | 'tax'
  | 'unknown'
export type ReviewStatus =
  'draft' | 'needs_review' | 'suggested' | 'confirmed' | 'accountant_reviewed'
export type TransactionSource =
  'manual' | 'voice' | 'document' | 'bank' | 'integration'

export interface Organization {
  id: string
  name: string
  taxId?: string
  country: 'PT'
  currency: 'EUR'
  fiscalYear: number
  openingBalance: number
  createdAt: string
}

export interface Transaction {
  id: string
  organizationId: string
  type: TransactionType
  description: string
  amount: number
  currency: 'EUR'
  date: string
  category: string
  subcategory?: string
  counterparty?: string
  documentId?: string
  source: TransactionSource
  taxStatus: ReviewStatus
  accountingStatus: ReviewStatus
  confidence: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface Document {
  id: string
  organizationId: string
  transactionId?: string
  type:
    | 'invoice'
    | 'receipt'
    | 'bank_statement'
    | 'contract'
    | 'tax_document'
    | 'other'
  filename: string
  storageUrl?: string
  extractedData?: Record<string, unknown>
  status: ReviewStatus
  createdAt: string
}

export type UserRole = 'owner' | 'admin' | 'finance' | 'accountant' | 'viewer'

export interface ReviewDecision {
  id: string
  transactionId: string
  organizationId: string
  suggestedCategory: string
  finalCategory: string
  decidedBy: string
  decidedAt: string
}
