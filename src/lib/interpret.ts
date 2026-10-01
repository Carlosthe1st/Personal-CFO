import type { Transaction } from '../domain/models'
import { portugalDate } from './date'

export interface Proposal {
  kind: 'proposal'
  transaction: Transaction
  reply: string
}
export interface Question {
  kind: 'question'
  reply: string
}
export type Interpretation = Proposal | Question

function parseAmount(message: string): number | null {
  const match = message.match(
    /(?:€\s*([-−+]?\s*[\d.,]+)|(?<![\d.,])([-−+]?\s*[\d.,]+)\s*(?:€|euros?))/i,
  )
  const raw = match?.[1] ?? match?.[2]
  if (!raw) return null
  const amount = raw.replace(/\s/g, '').replace(/^\+/, '')
  let normalized: string
  if (/^\d+(?:,\d{1,2})?$/.test(amount)) normalized = amount.replace(',', '.')
  else if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(amount))
    normalized = amount.replaceAll('.', '').replace(',', '.')
  else if (/^\d+\.\d{1,2}$/.test(amount)) normalized = amount
  else if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(amount))
    normalized = amount.replaceAll(',', '')
  else return null
  const value = Number(normalized)
  return Number.isFinite(value) && value > 0 ? value : null
}

function suggestCategory(message: string, type: Transaction['type']): string {
  if (type === 'income') return 'Clientes'
  if (/combust[ií]vel|gasolina|portagem|uber|t[aá]xi/i.test(message))
    return 'Deslocações'
  if (/computador|macbook|port[aá]til|equipamento|monitor/i.test(message))
    return 'Equipamento'
  if (/software|subscri[cç][aã]o|licen[cç]a/i.test(message)) return 'Software'
  if (/renda|escrit[oó]rio|aluguer/i.test(message)) return 'Instalações'
  if (/almo[cç]o|refei[cç][aã]o|restaurante/i.test(message)) return 'Refeições'
  return 'Outros'
}

export function interpretMessage(
  message: string,
  organizationId: string,
  now: Date,
): Interpretation {
  const amount = parseAmount(message)
  const isQuestion = /\?|^(quanto|posso|como|qual|quais)\b/i.test(
    message.trim(),
  )
  if (isQuestion || !amount)
    return {
      kind: 'question',
      reply: isQuestion
        ? 'Posso ajudar a organizar lançamentos e mostrar os números do painel. Para questões fiscais, confirma sempre com o teu contabilista.'
        : 'Não consegui identificar um valor. Experimenta escrever, por exemplo: “Paguei 180 € de combustível”.',
    }
  if (/\b(não|nao|nunca|jamais)\b/i.test(message))
    return {
      kind: 'question',
      reply:
        'Percebi uma negação na tua mensagem. Confirma se houve mesmo uma entrada ou saída antes de registar o movimento.',
    }
  const isIncome =
    /\b(recebi|recebemos|entrada|fatur[ae]i|vendi|pagou-me|pagaram)\b/i.test(
      message,
    )
  const isExpense =
    /\b(paguei|pagamos|pag[aá]mos|pagamento|comprei|compramos|compr[aá]mos|compra|gastei|gastamos|gast[aá]mos|despesa|sa[ií]da|debitado)\b/i.test(
      message,
    )
  if (isIncome === isExpense)
    return {
      kind: 'question',
      reply:
        'Não ficou claro se foi uma entrada ou saída. Diz-me o que aconteceu, por exemplo: “Recebi 500 €” ou “Paguei 500 €”.',
    }
  const type: Transaction['type'] = isIncome ? 'income' : 'expense'
  const category = suggestCategory(message, type)
  const timestamp = now.toISOString()
  const transaction: Transaction = {
    id: crypto.randomUUID(),
    organizationId,
    type,
    description: message.trim(),
    amount,
    currency: 'EUR',
    date: portugalDate(now),
    category,
    source: 'manual',
    taxStatus: 'needs_review',
    accountingStatus: 'suggested',
    confidence: category === 'Outros' ? 0.55 : 0.78,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  return {
    kind: 'proposal',
    transaction,
    reply: `A minha sugestão é registar ${type === 'income' ? 'uma entrada' : 'uma saída'} de ${new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(amount)} em “${category}”. Confirma os dados antes de guardar. A classificação contabilística e fiscal necessita de revisão.`,
  }
}
