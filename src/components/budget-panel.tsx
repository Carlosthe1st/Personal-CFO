'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { portugalDate } from '../lib/date'
import { CategoryCreator } from './category-creator'

type Account = { id: string; name: string; kind?: string; active: boolean }
type Cell = {
  month: number
  accountId: string
  plannedCents: number
  realizedCents: string
  availableCents: string
}

type Fund = { id: string; name: string; active: boolean; version: number }
type FundBudget = {
  year: number
  funds: Fund[]
  cells: {
    fundId: string
    month: number
    plannedCents: number
    realizedCents: string
    availableCents: string
  }[]
  events: { id: string; mode: string; reason: string }[]
  annualCents: string
  plannedCents: string
  warnings: string[]
}

export function FundBudgetPanel({
  organizationId,
  role,
  funds,
}: {
  organizationId: string
  role: 'owner' | 'admin' | 'editor' | 'reader'
  funds: Fund[]
}) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() =>
    Number(portugalDate(new Date()).slice(0, 4)),
  )
  const [budget, setBudget] = useState<FundBudget | null>(null)
  const [revision, setRevision] = useState(0)
  const [fundId, setFundId] = useState('')
  const [month, setMonth] = useState(1)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [fromFundId, setFromFundId] = useState('')
  const [fromMonth, setFromMonth] = useState(1)
  const [toFundId, setToFundId] = useState('')
  const [toMonth, setToMonth] = useState(1)
  const [transferAmount, setTransferAmount] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const operation = useRef({
    revise: crypto.randomUUID(),
    transfer: crypto.randomUUID(),
  })
  const canManage = role === 'owner' || role === 'admin'
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    fetch(`/api/organizations/${organizationId}/funds/budgets?year=${year}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((response) => {
        if (!response.ok)
          throw new Error('Não foi possível consultar as verbas dos fundos.')
        return response.json() as Promise<FundBudget>
      })
      .then((data) => {
        if (!controller.signal.aborted) setBudget(data)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Erro de ligação.')
      })
    return () => controller.abort()
  }, [open, organizationId, year, revision])
  async function save(
    mode: 'revise' | 'transfer',
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    if (pending) return
    const amountCents = cents(mode === 'revise' ? amount : transferAmount)
    if (amountCents === null || (mode === 'transfer' && amountCents === 0)) {
      setError('Confirma o valor da verba.')
      return
    }
    setPending(true)
    setError('')
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/funds/budgets`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            year,
            mode,
            operationId: operation.current[mode],
            reason: mode === 'revise' ? reason : transferReason,
            amountCents,
            to:
              mode === 'revise'
                ? { fundId, month }
                : { fundId: toFundId, month: toMonth },
            ...(mode === 'transfer'
              ? { from: { fundId: fromFundId, month: fromMonth } }
              : {}),
          }),
        },
      )
      if (!response.ok)
        throw new Error('Não foi possível guardar a verba do fundo.')
      operation.current[mode] = crypto.randomUUID()
      setRevision((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro de ligação.')
    } finally {
      setPending(false)
    }
  }
  const fundOptions = funds
    .filter((fund) => fund.active)
    .map((fund) => (
      <option key={fund.id} value={fund.id}>
        {fund.name}
      </option>
    ))
  const monthOptions = months.map((name, index) => (
    <option key={name} value={index + 1}>
      {name}
    </option>
  ))
  return (
    <section>
      <h2>Verbas por fundo</h2>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Fechar verbas por fundo' : 'Abrir verbas por fundo'}
      </button>
      {open && (
        <>
          <label>
            Ano das verbas{' '}
            <input
              type="number"
              min={1900}
              max={9998}
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          {budget && (
            <>
              <p>
                Orçamento geral: {euro(budget.annualCents)} · Verbas dos fundos:{' '}
                {euro(budget.plannedCents)}
              </p>
              {budget.warnings.length > 0 && (
                <p role="alert">
                  As verbas dos fundos excedem o orçamento geral.
                </p>
              )}
              <table>
                <thead>
                  <tr>
                    <th>Fundo e mês</th>
                    <th>Planeado</th>
                    <th>Realizado</th>
                    <th>Disponível</th>
                  </tr>
                </thead>
                <tbody>
                  {budget.cells.map((cell) => (
                    <tr key={`${cell.fundId}:${cell.month}`}>
                      <td>
                        {funds.find((fund) => fund.id === cell.fundId)?.name ??
                          'Fundo arquivado'}{' '}
                        · {months[cell.month - 1]}
                      </td>
                      <td>{euro(cell.plannedCents)}</td>
                      <td>{euro(cell.realizedCents)}</td>
                      <td>{euro(cell.availableCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3>Histórico das verbas</h3>
              <ul>
                {budget.events.map((item) => (
                  <li key={item.id}>
                    {item.mode === 'transfer' ? 'Transferência' : 'Revisão'} ·{' '}
                    {item.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          {canManage && (
            <>
              <form onSubmit={(event) => save('revise', event)}>
                <h3>Rever verba</h3>
                <label>
                  Fundo a planear{' '}
                  <select
                    required
                    value={fundId}
                    onChange={(event) => setFundId(event.target.value)}
                  >
                    <option value="">Selecionar</option>
                    {fundOptions}
                  </select>
                </label>
                <label>
                  Mês a planear{' '}
                  <select
                    value={month}
                    onChange={(event) => setMonth(Number(event.target.value))}
                  >
                    {monthOptions}
                  </select>
                </label>
                <label>
                  Verba do fundo em EUR{' '}
                  <input
                    required
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
                <label>
                  Motivo da revisão do fundo{' '}
                  <input
                    required
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={pending}>
                  Guardar verba do fundo
                </button>
              </form>
              <form onSubmit={(event) => save('transfer', event)}>
                <h3>Transferir verba entre fundos</h3>
                <label>
                  Fundo de origem{' '}
                  <select
                    required
                    value={fromFundId}
                    onChange={(event) => setFromFundId(event.target.value)}
                  >
                    <option value="">Selecionar</option>
                    {fundOptions}
                  </select>
                </label>
                <label>
                  Mês de origem do fundo{' '}
                  <select
                    value={fromMonth}
                    onChange={(event) =>
                      setFromMonth(Number(event.target.value))
                    }
                  >
                    {monthOptions}
                  </select>
                </label>
                <label>
                  Fundo de destino{' '}
                  <select
                    required
                    value={toFundId}
                    onChange={(event) => setToFundId(event.target.value)}
                  >
                    <option value="">Selecionar</option>
                    {fundOptions}
                  </select>
                </label>
                <label>
                  Mês de destino do fundo{' '}
                  <select
                    value={toMonth}
                    onChange={(event) => setToMonth(Number(event.target.value))}
                  >
                    {monthOptions}
                  </select>
                </label>
                <label>
                  Transferir entre fundos em EUR{' '}
                  <input
                    required
                    value={transferAmount}
                    onChange={(event) => setTransferAmount(event.target.value)}
                  />
                </label>
                <label>
                  Motivo da transferência de fundos{' '}
                  <input
                    required
                    value={transferReason}
                    onChange={(event) => setTransferReason(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={pending}>
                  Transferir entre fundos
                </button>
              </form>
            </>
          )}
        </>
      )}
    </section>
  )
}
type Budget = {
  year: number
  fiscalYearStartMonth: number
  version: number
  annualCents: number
  plannedCents: string
  undistributedCents: string
  realizedCents: string
  availableCents: string
  warnings: string[]
  cells: Cell[]
  history: {
    id: string
    action: string
    version: number
    reason?: string
    createdAt: string
  }[]
}

const months = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]
function cents(text: string): number | null {
  const parts = text.trim().match(/^(\d{1,14})(?:[,.](\d{1,2}))?$/)
  if (!parts) return null
  const value =
    BigInt(parts[1]) * BigInt(100) + BigInt((parts[2] ?? '').padEnd(2, '0'))
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null
}
function euro(value: string | number) {
  const cents = BigInt(value)
  const sign = cents < BigInt(0) ? '−' : ''
  const absolute = cents < BigInt(0) ? -cents : cents
  return `${sign}${new Intl.NumberFormat('pt-PT').format(absolute / BigInt(100))},${String(absolute % BigInt(100)).padStart(2, '0')} €`
}

export function BudgetPanel({
  organizationId,
  role,
  accounts,
  onAccountsChanged,
}: {
  organizationId: string
  role: 'owner' | 'admin' | 'editor' | 'reader'
  accounts: Account[]
  onAccountsChanged?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() =>
    Number(portugalDate(new Date()).slice(0, 4)),
  )
  const [budget, setBudget] = useState<Budget | null>(null)
  const [annual, setAnnual] = useState('')
  const [month, setMonth] = useState('1')
  const [category, setCategory] = useState('')
  const [allocation, setAllocation] = useState('')
  const [fromMonth, setFromMonth] = useState('1')
  const [fromCategory, setFromCategory] = useState('')
  const [toMonth, setToMonth] = useState('1')
  const [toCategory, setToCategory] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const operations = useRef({
    annual: crypto.randomUUID(),
    cell: crypto.randomUUID(),
    transfer: crypto.randomUUID(),
  })
  const categories = accounts.filter(
    (account) => account.active && account.kind === 'expense',
  )
  const fiscalMonths = months.map(
    (_, index) =>
      months[((budget?.fiscalYearStartMonth ?? 1) + index - 1) % 12],
  )
  const canEdit = role === 'owner' || role === 'admin'

  async function load(signal?: AbortSignal) {
    const response = await fetch(
      `/api/organizations/${organizationId}/budgets/${year}`,
      {
        signal,
        cache: 'no-store',
      },
    )
    if (!response.ok) throw new Error('Não foi possível consultar o orçamento.')
    const next = (await response.json()) as Budget
    if (!signal?.aborted) {
      setBudget(next)
      const annualCents = BigInt(next.annualCents)
      setAnnual(
        `${annualCents / BigInt(100)},${String(annualCents % BigInt(100)).padStart(2, '0')}`,
      )
    }
  }
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setBudget(null)
        setError('')
        load(controller.signal).catch((cause: unknown) => {
          if (!controller.signal.aborted)
            setError(
              cause instanceof Error ? cause.message : 'Serviço indisponível.',
            )
        })
      }
    })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId, year])

  async function submit(
    action: 'annual' | 'cell' | 'transfer',
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    if (pending || !budget) return
    let payload: Record<string, unknown>
    if (action === 'annual') {
      const annualCents = cents(annual)
      if (annualCents === null)
        return setError('Indica uma verba anual válida.')
      payload = { action: 'revise', annualCents }
    } else if (action === 'cell') {
      const plannedCents = cents(allocation)
      if (plannedCents === null || !category)
        return setError('Indica mês, categoria e alocação válidos.')
      payload = {
        action: 'revise',
        cells: [{ month: Number(month), accountId: category, plannedCents }],
      }
    } else {
      const amountCents = cents(transferAmount)
      if (!amountCents || !fromCategory || !toCategory)
        return setError('Indica origem, destino e valor a transferir.')
      payload = {
        action: 'transfer',
        from: { month: Number(fromMonth), accountId: fromCategory },
        to: { month: Number(toMonth), accountId: toCategory },
        amountCents,
      }
    }
    setPending(true)
    setError('')
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/budgets/${year}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            expectedVersion: budget.version,
            idempotencyKey: operations.current[action],
            reason,
          }),
        },
      )
      if (!response.ok) {
        const failure = await response.json()
        throw new Error(
          typeof failure.error === 'string'
            ? failure.error
            : 'Não foi possível guardar o orçamento.',
        )
      }
      operations.current[action] = crypto.randomUUID()
      await load()
      if (action === 'cell') setAllocation('')
      if (action === 'transfer') setTransferAmount('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Serviço indisponível.')
    } finally {
      setPending(false)
    }
  }
  return (
    <section>
      <h2>Orçamento mensal</h2>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Fechar orçamento' : 'Abrir orçamento'}
      </button>
      {open && (
        <>
          <label>
            Exercício{' '}
            <input
              type="number"
              min="1900"
              max="9998"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          {!budget ? (
            <p role="status">A consultar orçamento…</p>
          ) : (
            <>
              <p>
                Verba anual: {euro(budget.annualCents)} · Planeado:{' '}
                {euro(budget.plannedCents)} · Realizado:{' '}
                {euro(budget.realizedCents)} · Por distribuir:{' '}
                {euro(budget.undistributedCents)}
              </p>
              {budget.warnings.includes('deficit') && (
                <p role="status">Défice: há despesas acima da alocação.</p>
              )}
              {budget.warnings.includes('overallocated') && (
                <p role="status">A soma das alocações excede a verba anual.</p>
              )}
              {budget.warnings.includes('unallocated') && (
                <p role="status">Há verba por distribuir.</p>
              )}
              <table>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Categoria</th>
                    <th>Planeado</th>
                    <th>Realizado</th>
                    <th>Disponível</th>
                  </tr>
                </thead>
                <tbody>
                  {budget.cells.map((cell) => (
                    <tr key={`${cell.month}:${cell.accountId}`}>
                      <td>{fiscalMonths[cell.month - 1]}</td>
                      <td>
                        {categories.find((item) => item.id === cell.accountId)
                          ?.name ?? 'Categoria'}
                      </td>
                      <td>{euro(cell.plannedCents)}</td>
                      <td>{euro(cell.realizedCents)}</td>
                      <td>{euro(cell.availableCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {canEdit && (
                <>
                  <label>
                    Motivo (opcional){' '}
                    <input
                      maxLength={1000}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <form onSubmit={(event) => submit('annual', event)}>
                    <label>
                      Verba anual em EUR{' '}
                      <input
                        required
                        inputMode="decimal"
                        value={annual}
                        onChange={(event) => {
                          setAnnual(event.target.value)
                          operations.current.annual = crypto.randomUUID()
                        }}
                      />
                    </label>
                    <button disabled={pending} type="submit">
                      Guardar verba anual
                    </button>
                  </form>
                  <CategoryCreator
                    organizationId={organizationId}
                    kind="expense"
                    onCreated={(id) => {
                      setCategory(id)
                      onAccountsChanged?.()
                    }}
                  />
                  <form onSubmit={(event) => submit('cell', event)}>
                    <label>
                      Mês a planear{' '}
                      <select
                        value={month}
                        onChange={(event) => {
                          setMonth(event.target.value)
                          operations.current.cell = crypto.randomUUID()
                        }}
                      >
                        {fiscalMonths.map((name, index) => (
                          <option key={name} value={index + 1}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Categoria a planear{' '}
                      <select
                        required
                        value={category}
                        onChange={(event) => {
                          setCategory(event.target.value)
                          operations.current.cell = crypto.randomUUID()
                        }}
                      >
                        <option value="">Selecionar</option>
                        {categories.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Alocação em EUR{' '}
                      <input
                        required
                        inputMode="decimal"
                        value={allocation}
                        onChange={(event) => {
                          setAllocation(event.target.value)
                          operations.current.cell = crypto.randomUUID()
                        }}
                      />
                    </label>
                    <button disabled={pending} type="submit">
                      Guardar alocação
                    </button>
                  </form>
                  <form onSubmit={(event) => submit('transfer', event)}>
                    <label>
                      Mês de origem{' '}
                      <select
                        value={fromMonth}
                        onChange={(event) => {
                          setFromMonth(event.target.value)
                          operations.current.transfer = crypto.randomUUID()
                        }}
                      >
                        {fiscalMonths.map((name, index) => (
                          <option key={name} value={index + 1}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Categoria de origem{' '}
                      <select
                        required
                        value={fromCategory}
                        onChange={(event) => {
                          setFromCategory(event.target.value)
                          operations.current.transfer = crypto.randomUUID()
                        }}
                      >
                        <option value="">Selecionar</option>
                        {categories.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Mês de destino{' '}
                      <select
                        value={toMonth}
                        onChange={(event) => {
                          setToMonth(event.target.value)
                          operations.current.transfer = crypto.randomUUID()
                        }}
                      >
                        {fiscalMonths.map((name, index) => (
                          <option key={name} value={index + 1}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Categoria de destino{' '}
                      <select
                        required
                        value={toCategory}
                        onChange={(event) => {
                          setToCategory(event.target.value)
                          operations.current.transfer = crypto.randomUUID()
                        }}
                      >
                        <option value="">Selecionar</option>
                        {categories.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Transferir em EUR{' '}
                      <input
                        required
                        inputMode="decimal"
                        value={transferAmount}
                        onChange={(event) => {
                          setTransferAmount(event.target.value)
                          operations.current.transfer = crypto.randomUUID()
                        }}
                      />
                    </label>
                    <button disabled={pending} type="submit">
                      Transferir verba
                    </button>
                  </form>
                </>
              )}
              <h3>Histórico do orçamento</h3>
              {budget.history.length === 0 ? (
                <p>Sem alterações.</p>
              ) : (
                <ul>
                  {budget.history.map((event) => (
                    <li key={event.id}>
                      {event.action === 'transfer'
                        ? 'Transferência'
                        : 'Revisão'}{' '}
                      · versão {event.version} · {event.reason || 'Sem motivo'}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
