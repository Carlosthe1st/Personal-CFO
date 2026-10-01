import type { Interpretation } from './interpret'

export interface AIProvider {
  analyzeTransaction(
    text: string,
    organizationId: string,
  ): Promise<Interpretation>
  analyzeDocument(documentId: string): Promise<unknown>
  answerFinancialQuestion(
    question: string,
    organizationId: string,
  ): Promise<string>
}

// A real provider belongs on the server; the MVP uses deterministic local interpretation.
