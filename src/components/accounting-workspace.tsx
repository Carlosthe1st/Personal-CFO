'use client'

import { useEffect, useState, useRef, type FormEvent } from 'react'
import Link from 'next/link'
import type { MemberRole, AccountKind } from '../db/schema'
import type { JournalEntryView } from '../server/journal'
import { formatEuro } from '../lib/finance'
import { portugalDate } from '../lib/date'
import { BudgetPanel } from './budget-panel'
import { AccountManager } from './account-manager'
import { ReportPanel } from './report-panel'

type Organization = { id: string; name: string; role: MemberRole }
type Account = {
  id: string
  code: string
  name: string
  active: boolean
  kind?: AccountKind
  version?: number
}

async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok)
    throw new Error(
      'Não foi possível consultar os dados. Verifica o acesso e tenta novamente.',
    )
  return response.json()
}
export function AccountingWorkspace({
  organizations,
}: {
  organizations: Organization[]
}) {
  const [ownOrganizations, setOwnOrganizations] = useState(organizations)
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.id ?? '',
  )
  const [accounts, setAccounts] = useState<Account[]>([])
  const [journal, setJournal] = useState<JournalEntryView[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [loadedOrganizationId, setLoadedOrganizationId] = useState('')
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (creating) return
    setCreating(true)
    setError('')
    try {
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!response.ok)
        throw new Error(
          'Não foi possível criar a organização. Tenta novamente.',
        )
      const organization = await response.json()
      setOwnOrganizations((current) => [
        ...current,
        { ...organization, role: 'owner' },
      ])
      setOrganizationId(organization.id)
      setName('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Serviço indisponível.')
    } finally {
      setCreating(false)
    }
  }
  useEffect(() => {
    const controller = new AbortController()
    if (organizationId) {
      queueMicrotask(() => {
        if (!controller.signal.aborted) setLoading(true)
      })
      Promise.all([
        read<Account[]>(
          `/api/organizations/${organizationId}/accounts`,
          controller.signal,
        ),
        read<JournalEntryView[]>(
          `/api/organizations/${organizationId}/journal`,
          controller.signal,
        ),
      ])
        .then(([nextAccounts, nextJournal]) => {
          if (!controller.signal.aborted) {
            setAccounts(nextAccounts)
            setJournal(nextJournal)
            setLoadedOrganizationId(organizationId)
            setError('')
            setLoading(false)
          }
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) {
            setAccounts([])
            setJournal([])
            setLoadedOrganizationId(organizationId)
            setError(
              cause instanceof Error ? cause.message : 'Serviço indisponível.',
            )
            setLoading(false)
          }
        })
    } else
      queueMicrotask(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [organizationId, revision])
  return (
    <main className="accounting-workspace">
      <h1>Contabilidade</h1>
      <p>Área autenticada em desenvolvimento. Usa apenas dados fictícios.</p>
      <p>
        <Link href="/">Voltar à demonstração</Link> ·{' '}
        <Link href="/api/auth/signout" prefetch={false}>
          Terminar sessão
        </Link>
      </p>
      <label>
        Organização{' '}
        <select
          value={organizationId}
          onChange={(event) => setOrganizationId(event.target.value)}
        >
          {ownOrganizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </label>
      <form onSubmit={create}>
        <label>
          Nome da organização{' '}
          <input
            required
            maxLength={120}
            value={name}
            disabled={creating}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" disabled={creating}>
          {creating ? 'A criar…' : 'Criar organização'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {organizationId &&
        ['owner', 'admin'].includes(
          ownOrganizations.find((org) => org.id === organizationId)?.role ?? '',
        ) && (
          <MemberForm
            key={`members-${organizationId}`}
            organizationId={organizationId}
            owner={
              ownOrganizations.find((org) => org.id === organizationId)
                ?.role === 'owner'
            }
          />
        )}
      {loading || loadedOrganizationId !== organizationId ? (
        <p role="status">A consultar o diário…</p>
      ) : (
        <>
          {['owner', 'admin'].includes(
            ownOrganizations.find((org) => org.id === organizationId)?.role ??
              '',
          ) && (
            <AccountManager
              organizationId={organizationId}
              accounts={accounts}
              onSaved={() => setRevision((value) => value + 1)}
            />
          )}
          {ownOrganizations.find((org) => org.id === organizationId)?.role !==
            'reader' &&
            organizationId && (
              <>
                <MovementForm
                  key={`movement-${organizationId}`}
                  organizationId={organizationId}
                  accounts={accounts}
                  onSaved={() => setRevision((value) => value + 1)}
                />
                <JournalForm
                  key={organizationId}
                  organizationId={organizationId}
                  accounts={accounts}
                  onSaved={() => setRevision((value) => value + 1)}
                />
              </>
            )}
          <h2>Diário confirmado</h2>
          <button
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Atualizar diário
          </button>
          {journal.length === 0 && <p>Sem lançamentos confirmados.</p>}
          {journal.map((entry) => (
            <section key={entry.id}>
              <h3>{entry.description}</h3>
              <p>{entry.date}</p>
              <ul>
                {entry.lines.map((line, index) => (
                  <li key={index}>
                    {line.side === 'debit' ? 'Débito' : 'Crédito'} ·{' '}
                    {accounts.find((account) => account.id === line.accountId)
                      ?.name ?? 'Conta'}{' '}
                    · {formatEuro(line.amountCents / 100)}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <BudgetPanel
            key={`budget-${organizationId}`}
            organizationId={organizationId}
            role={
              ownOrganizations.find((org) => org.id === organizationId)?.role ??
              'reader'
            }
            accounts={accounts}
          />
          <ReportPanel
            key={`reports-${organizationId}`}
            organizationId={organizationId}
            accounts={accounts}
          />
        </>
      )}
    </main>
  )
}

function MovementForm({
  organizationId,
  accounts,
  onSaved,
}: {
  organizationId: string
  accounts: Account[]
  onSaved: () => void
}) {
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense')
  const [date, setDate] = useState(() => portugalDate(new Date()))
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [financialAccountId, setFinancialAccountId] = useState('')
  const [counterAccountId, setCounterAccountId] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const operation = useRef(crypto.randomUUID())
  const busy = useRef(false)
  const financialAccounts = accounts.filter(
    (account) =>
      account.active && ['cash', 'bank'].includes(account.kind ?? ''),
  )
  const counterAccounts = accounts.filter(
    (account) =>
      account.active &&
      (type === 'transfer'
        ? ['cash', 'bank'].includes(account.kind ?? '') &&
          account.id !== financialAccountId
        : account.kind === type),
  )
  function edited() {
    operation.current = crypto.randomUUID()
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const parts = amount.trim().match(/^(\d{1,14})(?:[,.](\d{1,2}))?$/)
    const cents = parts
      ? BigInt(parts[1]) * BigInt(100) + BigInt((parts[2] ?? '').padEnd(2, '0'))
      : BigInt(0)
    if (
      cents <= 0 ||
      cents > BigInt(Number.MAX_SAFE_INTEGER) ||
      !description.trim() ||
      !financialAccountId ||
      !counterAccountId ||
      financialAccountId === counterAccountId
    ) {
      setError('Confirma a descrição, as contas e um valor válido em EUR.')
      return
    }
    busy.current = true
    setPending(true)
    setError('')
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/movements`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type,
            date,
            description,
            amountCents: Number(cents),
            financialAccountId,
            counterAccountId,
            idempotencyKey: operation.current,
          }),
        },
      )
      if (!response.ok) {
        const failure = await response.json()
        throw new Error(
          typeof failure.error === 'string'
            ? failure.error
            : 'Não foi possível guardar. Tenta novamente.',
        )
      }
      setDescription('')
      setAmount('')
      edited()
      onSaved()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível guardar. Tenta novamente.',
      )
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return (
    <form onSubmit={submit}>
      <h2>Novo movimento</h2>
      {error && <p role="alert">{error}</p>}
      <fieldset disabled={pending}>
        <label>
          Tipo de movimento{' '}
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value as typeof type)
              setCounterAccountId('')
              edited()
            }}
          >
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
            <option value="transfer">Transferência</option>
          </select>
        </label>
        <label>
          Data do movimento{' '}
          <input
            type="date"
            required
            value={date}
            onChange={(event) => {
              setDate(event.target.value)
              edited()
            }}
          />
        </label>
        <label>
          Descrição do movimento{' '}
          <input
            required
            maxLength={500}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              edited()
            }}
          />
        </label>
        <label>
          Valor do movimento em EUR{' '}
          <input
            required
            inputMode="decimal"
            placeholder="180,00"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value)
              edited()
            }}
          />
        </label>
        <label>
          Conta de origem ou destino{' '}
          <select
            required
            value={financialAccountId}
            onChange={(event) => {
              setFinancialAccountId(event.target.value)
              setCounterAccountId('')
              edited()
            }}
          >
            <option value="">Selecionar conta</option>
            {financialAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} · {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categoria ou conta de transferência{' '}
          <select
            required
            value={counterAccountId}
            onChange={(event) => {
              setCounterAccountId(event.target.value)
              edited()
            }}
          >
            <option value="">Selecionar conta</option>
            {counterAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} · {account.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending}>
          {pending ? 'A guardar…' : 'Guardar movimento'}
        </button>
      </fieldset>
    </form>
  )
}

function MemberForm({
  organizationId,
  owner,
}: {
  organizationId: string
  owner: boolean
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('reader')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setMessage('')
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/members`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, role }),
        },
      )
      if (!response.ok)
        throw new Error(
          'Não foi possível atualizar o membro. Confirma o email registado e as permissões.',
        )
      setMessage('Membro atualizado.')
      setEmail('')
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Serviço indisponível.',
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <form onSubmit={submit}>
      <h2>Membros</h2>
      <p>
        O membro deve iniciar sessão pelo menos uma vez antes de ser adicionado.
        O proprietário não pode ser removido ou alterado.
      </p>
      <fieldset disabled={pending}>
        <label>
          Email do membro{' '}
          <input
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Papel{' '}
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="reader">Leitor</option>
            <option value="editor">Editor</option>
            {owner && <option value="admin">Administrador</option>}
          </select>
        </label>
        <button type="submit">Guardar membro</button>
      </fieldset>
      {message && <p role="status">{message}</p>}
    </form>
  )
}

function JournalForm({
  organizationId,
  accounts,
  onSaved,
}: {
  organizationId: string
  accounts: Account[]
  onSaved: () => void
}) {
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(() => portugalDate(new Date()))
  const [amount, setAmount] = useState('')
  const [debit, setDebit] = useState('')
  const [credit, setCredit] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const operation = useRef(crypto.randomUUID())
  const busy = useRef(false)
  function edited() {
    operation.current = crypto.randomUUID()
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const parts = amount.trim().match(/^(\d{1,14})(?:[,.](\d{1,2}))?$/)
    const cents = parts
      ? BigInt(parts[1]) * BigInt(100) + BigInt((parts[2] ?? '').padEnd(2, '0'))
      : BigInt(0)
    if (
      cents <= 0 ||
      cents > BigInt(Number.MAX_SAFE_INTEGER) ||
      !debit ||
      !credit ||
      !description.trim()
    ) {
      setError('Confirma a descrição, as contas e um valor válido em EUR.')
      return
    }
    busy.current = true
    setPending(true)
    setError('')
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/journal`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            date,
            description,
            idempotencyKey: operation.current,
            lines: [
              { accountId: debit, side: 'debit', amountCents: Number(cents) },
              { accountId: credit, side: 'credit', amountCents: Number(cents) },
            ],
          }),
        },
      )
      if (!response.ok) {
        const failure = await response.json()
        throw new Error(
          typeof failure.error === 'string'
            ? failure.error
            : 'Não foi possível guardar. Tenta novamente.',
        )
      }
      setDescription('')
      setAmount('')
      edited()
      onSaved()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível guardar. Tenta novamente.',
      )
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return (
    <form onSubmit={submit}>
      <h2>Novo lançamento equilibrado</h2>
      {error && <p role="alert">{error}</p>}
      <fieldset disabled={pending}>
        <label>
          Data{' '}
          <input
            type="date"
            required
            value={date}
            onChange={(event) => {
              setDate(event.target.value)
              edited()
            }}
          />
        </label>
        <label>
          Descrição{' '}
          <input
            required
            maxLength={500}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              edited()
            }}
          />
        </label>
        <label>
          Valor em EUR{' '}
          <input
            required
            inputMode="decimal"
            maxLength={20}
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value)
              edited()
            }}
            placeholder="180,00"
          />
        </label>
        <label>
          Conta a debitar{' '}
          <select
            required
            value={debit}
            onChange={(event) => {
              setDebit(event.target.value)
              edited()
            }}
          >
            <option value="">Selecionar conta</option>
            {accounts
              .filter((account) => account.active)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} · {account.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Conta a creditar{' '}
          <select
            required
            value={credit}
            onChange={(event) => {
              setCredit(event.target.value)
              edited()
            }}
          >
            <option value="">Selecionar conta</option>
            {accounts
              .filter((account) => account.active)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} · {account.name}
                </option>
              ))}
          </select>
        </label>
        <button disabled={pending} type="submit">
          {pending ? 'A guardar…' : 'Confirmar lançamento'}
        </button>
      </fieldset>
      <p>
        O lançamento confirmado é imutável. Correções por estorno serão
        adicionadas numa próxima etapa.
      </p>
    </form>
  )
}
