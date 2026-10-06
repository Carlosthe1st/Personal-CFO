'use client'

import { useEffect, useState, type FormEvent } from 'react'
import type { AccountKind, MemberRole } from '../db/schema'
import { portugalDate } from '../lib/date'

type Account = { id: string; name: string; kind?: AccountKind; active: boolean }
type Fund = { id: string; name: string; active: boolean }
type Rule = {
  id: string
  description: string
  type: string
  frequency: string
  amountCents: number
  active: boolean
  startDate: string
  endDate: string | null
  financialAccountId: string
  counterAccountId: string
  fundId: string | null
}
type Proposal = {
  ruleId: string
  dueDate: string
  effectiveDate: string
  type: 'income' | 'expense'
  description: string
  amountCents: number
}

export function RecurrencePanel({
  organizationId,
  role,
  accounts,
  funds,
}: {
  organizationId: string
  role: MemberRole
  accounts: Account[]
  funds: Fund[]
}) {
  const [open, setOpen] = useState(false)
  const [rules, setRules] = useState<Rule[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [revision, setRevision] = useState(0)
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [frequency, setFrequency] = useState<'monthly' | 'weekly'>('monthly')
  const [startDate, setStartDate] = useState(() => portugalDate(new Date()))
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [financialAccountId, setFinancialAccountId] = useState('')
  const [counterAccountId, setCounterAccountId] = useState('')
  const [fundId, setFundId] = useState('')
  const [endDate, setEndDate] = useState('')
  const [editingId, setEditingId] = useState('')
  const [active, setActive] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const canManage = role === 'owner' || role === 'admin'
  const canConfirm = role !== 'reader'
  const base = `/api/organizations/${organizationId}/recurrences`
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const today = portugalDate(new Date())
    const from = new Date(`${today}T00:00:00Z`)
    from.setUTCDate(from.getUTCDate() - 90)
    Promise.all([
      fetch(base, { signal: controller.signal, cache: 'no-store' }),
      fetch(
        `${base}?throughDate=${today}&fromDate=${from.toISOString().slice(0, 10)}`,
        { signal: controller.signal, cache: 'no-store' },
      ),
    ])
      .then(async ([ruleResponse, proposalResponse]) => {
        if (!ruleResponse.ok || !proposalResponse.ok)
          throw new Error('Não foi possível consultar as recorrências.')
        return [
          (await ruleResponse.json()) as Rule[],
          (await proposalResponse.json()) as Proposal[],
        ] as const
      })
      .then(([nextRules, nextProposals]) => {
        if (!controller.signal.aborted) {
          setRules(nextRules)
          setProposals(nextProposals)
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Erro de ligação.')
      })
    return () => controller.abort()
  }, [base, open, revision])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parts = amount.trim().match(/^(\d{1,14})(?:[,.](\d{1,2}))?$/)
    const cents = parts
      ? BigInt(parts[1]) * BigInt(100) + BigInt((parts[2] ?? '').padEnd(2, '0'))
      : BigInt(0)
    if (cents <= 0 || cents > BigInt(Number.MAX_SAFE_INTEGER)) {
      setError('Confirma o valor da recorrência.')
      return
    }
    setPending(true)
    setError('')
    try {
      const response = await fetch(editingId ? `${base}/${editingId}` : base, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type,
          frequency,
          startDate,
          endDate: endDate || null,
          description,
          amountCents: Number(cents),
          financialAccountId,
          counterAccountId,
          fundId: fundId || null,
          active,
        }),
      })
      if (!response.ok)
        throw new Error('Não foi possível guardar a recorrência.')
      setDescription('')
      setAmount('')
      setEditingId('')
      setActive(true)
      setRevision((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro de ligação.')
    } finally {
      setPending(false)
    }
  }
  function edit(rule: Rule) {
    setEditingId(rule.id)
    setType(rule.type as 'income' | 'expense')
    setFrequency(rule.frequency as 'monthly' | 'weekly')
    setStartDate(rule.startDate)
    setEndDate(rule.endDate ?? '')
    setDescription(rule.description)
    setAmount((rule.amountCents / 100).toFixed(2).replace('.', ','))
    setFinancialAccountId(rule.financialAccountId)
    setCounterAccountId(rule.counterAccountId)
    setFundId(rule.fundId ?? '')
    setActive(rule.active)
  }
  async function act(
    proposal: Proposal,
    action: 'confirm' | 'skip' | 'postpone',
  ) {
    const postponedUntil =
      action === 'postpone' ? window.prompt('Nova data (AAAA-MM-DD):') : null
    if (action === 'postpone' && !postponedUntil) return
    setPending(true)
    setError('')
    try {
      const response = await fetch(
        `${base}/${proposal.ruleId}/occurrences/${proposal.dueDate}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action,
            ...(postponedUntil ? { postponedUntil } : {}),
          }),
        },
      )
      if (!response.ok)
        throw new Error('Não foi possível resolver a ocorrência.')
      setRevision((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro de ligação.')
    } finally {
      setPending(false)
    }
  }
  return (
    <section>
      <h2>Movimentos recorrentes</h2>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Fechar recorrências' : 'Abrir recorrências'}
      </button>
      {open && (
        <>
          <p>
            As ocorrências são propostas. Nenhum movimento é lançado sem
            confirmação.
          </p>
          {error && <p role="alert">{error}</p>}
          <h3>Propostas devidas</h3>
          {proposals.length === 0 && <p>Sem propostas devidas.</p>}
          <ul>
            {proposals.map((item) => (
              <li key={`${item.ruleId}:${item.dueDate}`}>
                {item.effectiveDate} · {item.description} ·{' '}
                {(item.amountCents / 100).toFixed(2)} €{' '}
                {canConfirm && (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(item, 'confirm')}
                    >
                      Confirmar {item.description}
                    </button>{' '}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(item, 'skip')}
                    >
                      Ignorar {item.description}
                    </button>{' '}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(item, 'postpone')}
                    >
                      Adiar {item.description}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <h3>Regras</h3>
          <ul>
            {rules.map((rule) => (
              <li key={rule.id}>
                {rule.description} · {rule.frequency} ·{' '}
                {rule.active ? 'Ativa' : 'Arquivada'}
                {canManage && (
                  <button type="button" onClick={() => edit(rule)}>
                    Editar {rule.description}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canManage && (
            <form onSubmit={create}>
              <h3>{editingId ? 'Editar regra' : 'Nova regra'}</h3>
              <label>
                Tipo recorrente{' '}
                <select
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value as typeof type)
                    setCounterAccountId('')
                  }}
                >
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                </select>
              </label>
              <label>
                Frequência{' '}
                <select
                  value={frequency}
                  onChange={(event) =>
                    setFrequency(event.target.value as typeof frequency)
                  }
                >
                  <option value="monthly">Mensal</option>
                  <option value="weekly">Semanal</option>
                </select>
              </label>
              <label>
                Início da regra{' '}
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label>
                Descrição recorrente{' '}
                <input
                  required
                  maxLength={500}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label>
                Fim da regra (opcional){' '}
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
              {editingId && (
                <label>
                  Estado da regra{' '}
                  <select
                    value={active ? 'active' : 'archived'}
                    onChange={(event) =>
                      setActive(event.target.value === 'active')
                    }
                  >
                    <option value="active">Ativa</option>
                    <option value="archived">Arquivada</option>
                  </select>
                </label>
              )}
              <label>
                Valor recorrente em EUR{' '}
                <input
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label>
                Conta financeira recorrente{' '}
                <select
                  required
                  value={financialAccountId}
                  onChange={(event) =>
                    setFinancialAccountId(event.target.value)
                  }
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
                Categoria recorrente{' '}
                <select
                  required
                  value={counterAccountId}
                  onChange={(event) => setCounterAccountId(event.target.value)}
                >
                  <option value="">Selecionar</option>
                  {accounts
                    .filter(
                      (account) => account.active && account.kind === type,
                    )
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Fundo recorrente{' '}
                <select
                  value={fundId}
                  onChange={(event) => setFundId(event.target.value)}
                >
                  <option value="">Sem fundo</option>
                  {funds
                    .filter((fund) => fund.active)
                    .map((fund) => (
                      <option key={fund.id} value={fund.id}>
                        {fund.name}
                      </option>
                    ))}
                </select>
              </label>
              <button type="submit" disabled={pending}>
                {editingId
                  ? 'Guardar regra recorrente'
                  : 'Criar regra recorrente'}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  )
}
