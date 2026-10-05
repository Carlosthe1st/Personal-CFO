'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AccountKind, MovementType } from '../db/schema'
import { formatEuro } from '../lib/finance'

type Account = { id: string; name: string; kind?: AccountKind; active: boolean }
type Movement = {
  id: string
  type: MovementType
  date: string
  description: string
  amountCents: number
  financialAccountId: string
  counterAccountId: string
  status: 'active' | 'corrected' | 'removed'
  change: { reason: string; replacementMovementId: string | null } | null
}

export function MovementHistory({
  organizationId,
  accounts,
  canEdit,
  revision,
  onSaved,
}: {
  organizationId: string
  accounts: Account[]
  canEdit: boolean
  revision: number
  onSaved: () => void
}) {
  const [movements, setMovements] = useState<Movement[]>([])
  const [selected, setSelected] = useState<Movement | null>(null)
  const [mode, setMode] = useState<'correct' | 'remove'>('correct')
  const [reason, setReason] = useState('')
  const [type, setType] = useState<MovementType>('expense')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [financialAccountId, setFinancialAccountId] = useState('')
  const [counterAccountId, setCounterAccountId] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const operation = useRef(crypto.randomUUID())
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/organizations/${organizationId}/movements`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((response) => {
        if (!response.ok)
          throw new Error('Não foi possível consultar movimentos.')
        return response.json() as Promise<Movement[]>
      })
      .then((rows) => setMovements(rows))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Erro de ligação.')
      })
    return () => controller.abort()
  }, [organizationId, revision])
  function choose(row: Movement, nextMode: 'correct' | 'remove') {
    setSelected(row)
    setMode(nextMode)
    setReason('')
    setType(row.type)
    setDate(row.date)
    setDescription(row.description)
    setAmount((row.amountCents / 100).toFixed(2).replace('.', ','))
    setFinancialAccountId(row.financialAccountId)
    setCounterAccountId(row.counterAccountId)
    setError('')
    operation.current = crypto.randomUUID()
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || pending) return
    const parsed = amount.match(/^(\d{1,14})(?:[,.](\d{1,2}))?$/)
    const cents = parsed
      ? BigInt(parsed[1]) * BigInt(100) +
        BigInt((parsed[2] ?? '').padEnd(2, '0'))
      : BigInt(0)
    if (
      !reason.trim() ||
      (mode === 'correct' &&
        (!description.trim() ||
          cents <= 0 ||
          cents > BigInt(Number.MAX_SAFE_INTEGER) ||
          !financialAccountId ||
          !counterAccountId ||
          financialAccountId === counterAccountId))
    ) {
      setError('Confirma o motivo, as contas e o valor.')
      return
    }
    setPending(true)
    setError('')
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/movements/${selected.id}/changes`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            reason,
            idempotencyKey: operation.current,
            ...(mode === 'correct'
              ? {
                  replacement: {
                    organizationId,
                    type,
                    date,
                    description,
                    amountCents: Number(cents),
                    financialAccountId,
                    counterAccountId,
                  },
                }
              : {}),
          }),
        },
      )
      if (!response.ok)
        throw new Error('Não foi possível corrigir o movimento.')
      setSelected(null)
      operation.current = crypto.randomUUID()
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro de ligação.')
    } finally {
      setPending(false)
    }
  }
  const eligibleCounter = accounts.filter(
    (account) =>
      account.active &&
      account.id !== financialAccountId &&
      (type === 'transfer'
        ? ['cash', 'bank'].includes(account.kind ?? '')
        : account.kind === type),
  )
  return (
    <section>
      <h2>Histórico de movimentos</h2>
      <p>
        Correções e remoções geram estornos; o original permanece no histórico.
      </p>
      {error && <p role="alert">{error}</p>}
      {movements.length === 0 && <p>Sem movimentos.</p>}
      <ul>
        {movements.map((row) => (
          <li key={row.id}>
            {row.date} · {row.description} · {formatEuro(row.amountCents / 100)}{' '}
            ·{' '}
            {row.status === 'active'
              ? 'Ativo'
              : row.status === 'corrected'
                ? 'Corrigido'
                : 'Removido'}
            {row.change && ` · Motivo: ${row.change.reason}`}
            {canEdit && row.status === 'active' && (
              <>
                {' '}
                <button type="button" onClick={() => choose(row, 'correct')}>
                  Corrigir
                </button>{' '}
                <button type="button" onClick={() => choose(row, 'remove')}>
                  Remover com estorno
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {selected && (
        <form onSubmit={submit}>
          <h3>
            {mode === 'correct' ? 'Corrigir movimento' : 'Remover movimento'}
          </h3>
          <p>{selected.description}</p>
          <fieldset disabled={pending}>
            <label>
              Motivo da alteração{' '}
              <input
                required
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {mode === 'correct' && (
              <>
                <label>
                  Tipo{' '}
                  <select
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value as MovementType)
                      setCounterAccountId('')
                    }}
                  >
                    <option value="expense">Despesa</option>
                    <option value="income">Receita</option>
                    <option value="transfer">Transferência</option>
                  </select>
                </label>
                <label>
                  Data{' '}
                  <input
                    required
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label>
                  Descrição{' '}
                  <input
                    required
                    maxLength={500}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <label>
                  Valor em EUR{' '}
                  <input
                    required
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label>
                  Conta financeira{' '}
                  <select
                    required
                    value={financialAccountId}
                    onChange={(e) => {
                      setFinancialAccountId(e.target.value)
                      setCounterAccountId('')
                    }}
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
                  Categoria ou conta de transferência{' '}
                  <select
                    required
                    value={counterAccountId}
                    onChange={(e) => setCounterAccountId(e.target.value)}
                  >
                    <option value="">Selecionar</option>
                    {eligibleCounter.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <button type="submit">
              {pending
                ? 'A guardar…'
                : mode === 'correct'
                  ? 'Confirmar correção'
                  : 'Confirmar remoção e estorno'}
            </button>{' '}
            <button type="button" onClick={() => setSelected(null)}>
              Cancelar
            </button>
          </fieldset>
        </form>
      )}
    </section>
  )
}
