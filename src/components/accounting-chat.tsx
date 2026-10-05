'use client'

import { useRef, useState, type FormEvent } from 'react'
import type { AccountKind } from '../db/schema'
import { interpretMessage } from '../lib/interpret'

type Account = { id: string; name: string; kind?: AccountKind; active: boolean }
type Suggestion = {
  type: 'income' | 'expense'
  date: string
  description: string
  amountCents: number
  category: string
}

export function AccountingChat({
  organizationId,
  accounts,
  onSaved,
}: {
  organizationId: string
  accounts: Account[]
  onSaved: () => void
}) {
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [financialAccountId, setFinancialAccountId] = useState('')
  const [counterAccountId, setCounterAccountId] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const operation = useRef(crypto.randomUUID())
  function propose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = interpretMessage(message, organizationId, new Date())
    setReply(result.reply)
    setError('')
    if (
      result.kind === 'proposal' &&
      ['income', 'expense'].includes(result.transaction.type)
    ) {
      const { transaction } = result
      setSuggestion({
        type: transaction.type as 'income' | 'expense',
        date: transaction.date,
        description: transaction.description,
        amountCents: Math.round(transaction.amount * 100),
        category: transaction.category,
      })
      setCounterAccountId('')
      operation.current = crypto.randomUUID()
    } else setSuggestion(null)
  }
  async function confirm() {
    if (!suggestion || pending) return
    if (!financialAccountId || !counterAccountId) {
      setError('Escolhe a conta financeira e a categoria antes de confirmar.')
      return
    }
    setPending(true)
    setError('')
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/movements`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...suggestion,
            financialAccountId,
            counterAccountId,
            idempotencyKey: operation.current,
          }),
        },
      )
      if (!response.ok) throw new Error('Não foi possível guardar a proposta.')
      setSuggestion(null)
      setMessage('')
      setReply('Movimento confirmado e registado na contabilidade.')
      operation.current = crypto.randomUUID()
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro de ligação.')
    } finally {
      setPending(false)
    }
  }
  return (
    <section>
      <h2>Assistente de movimentos</h2>
      <p>
        Descreve uma entrada ou despesa. A sugestão só é registada após
        confirmação.
      </p>
      <form onSubmit={propose}>
        <label>
          Mensagem{' '}
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Paguei 180 € de combustível"
            maxLength={500}
            required
          />
        </label>
        <button type="submit">Analisar</button>
      </form>
      {reply && <p role="status">{reply}</p>}
      {error && <p role="alert">{error}</p>}
      {suggestion && (
        <div>
          <p>
            {suggestion.description} · {suggestion.date} ·{' '}
            {(suggestion.amountCents / 100).toLocaleString('pt-PT', {
              style: 'currency',
              currency: 'EUR',
            })}
          </p>
          <label>
            Conta financeira{' '}
            <select
              value={financialAccountId}
              onChange={(event) => setFinancialAccountId(event.target.value)}
            >
              <option value="">Selecionar</option>
              {accounts
                .filter(
                  (account) =>
                    account.active &&
                    ['cash', 'bank'].includes(account.kind ?? ''),
                )
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Categoria sugerida: {suggestion.category}{' '}
            <select
              value={counterAccountId}
              onChange={(event) => setCounterAccountId(event.target.value)}
            >
              <option value="">Selecionar</option>
              {accounts
                .filter(
                  (account) =>
                    account.active && account.kind === suggestion.type,
                )
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
            </select>
          </label>
          <button type="button" disabled={pending} onClick={confirm}>
            {pending ? 'A guardar…' : 'Confirmar e guardar'}
          </button>{' '}
          <button type="button" onClick={() => setSuggestion(null)}>
            Descartar
          </button>
        </div>
      )}
    </section>
  )
}
