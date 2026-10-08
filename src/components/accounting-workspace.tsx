'use client'

import { useEffect, useMemo, useState, useRef, type FormEvent } from 'react'
import {
  ArrowLeftRight,
  BookOpenText,
  ChartNoAxesCombined,
  ChartPie,
  ChevronDown,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Settings2,
  X,
} from 'lucide-react'
import type { MemberRole, AccountKind } from '../db/schema'
import type { JournalEntryView } from '../server/journal'
import { formatEuro } from '../lib/finance'
import { portugalDate } from '../lib/date'
import { BudgetPanel, FundBudgetPanel } from './budget-panel'
import { AccountManager } from './account-manager'
import { CategoryCreator } from './category-creator'
import { ReportPanel } from './report-panel'
import { StatementPanel } from './statement-panel'
import { MovementHistory } from './movement-history'
import { RecurrencePanel } from './recurrence-panel'
import { ForecastPanel } from './forecast-panel'
import { AccountingChat } from './accounting-chat'
import { emailSignOut } from '../app/login/actions'

type Organization = { id: string; name: string; role: MemberRole }
type Fund = { id: string; name: string; active: boolean; version: number }
type View =
  | 'overview'
  | 'movements'
  | 'assistant'
  | 'budget'
  | 'journal'
  | 'reports'
  | 'management'
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
  receiptStorageConfigured = false,
}: {
  organizations: Organization[]
  receiptStorageConfigured?: boolean
}) {
  const [ownOrganizations, setOwnOrganizations] = useState(organizations)
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.id ?? '',
  )
  const [accounts, setAccounts] = useState<Account[]>([])
  const [funds, setFunds] = useState<Fund[]>([])
  const [journal, setJournal] = useState<JournalEntryView[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [loadedOrganizationId, setLoadedOrganizationId] = useState('')
  const [dataError, setDataError] = useState(false)
  const [view, setView] = useState<View>('overview')
  const [mobileMenu, setMobileMenu] = useState(false)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const menuToggleRef = useRef<HTMLButtonElement>(null)
  const selectedOrganization = ownOrganizations.find(
    (organization) => organization.id === organizationId,
  )
  const canManage =
    selectedOrganization?.role === 'owner' ||
    selectedOrganization?.role === 'admin'
  const canWrite =
    !!selectedOrganization && selectedOrganization.role !== 'reader'
  const summary = useMemo(() => {
    const byId = new Map(accounts.map((account) => [account.id, account]))
    const month = portugalDate(new Date()).slice(0, 7)
    let balance = 0
    let income = 0
    let expenses = 0
    const categories = new Map<string, number>()
    for (const entry of journal) {
      for (const line of entry.lines) {
        const account = byId.get(line.accountId)
        if (!account) continue
        const debit =
          line.side === 'debit' ? line.amountCents : -line.amountCents
        if (account.kind === 'cash' || account.kind === 'bank') balance += debit
        if (!entry.date.startsWith(month)) continue
        if (account.kind === 'income') income -= debit
        if (account.kind === 'expense') {
          expenses += debit
          categories.set(
            account.name,
            (categories.get(account.name) ?? 0) + debit,
          )
        }
      }
    }
    return {
      balance,
      income,
      expenses,
      categories: [...categories].sort((a, b) => b[1] - a[1]),
    }
  }, [accounts, journal])
  const navigation = [
    { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
    { id: 'movements', label: 'Movimentos', icon: ArrowLeftRight },
    { id: 'assistant', label: 'Falar com o CFO', icon: MessageSquareText },
    { id: 'budget', label: 'Orçamentos', icon: ChartPie },
    { id: 'journal', label: 'Diário', icon: BookOpenText },
    { id: 'reports', label: 'Relatórios', icon: FileSpreadsheet },
    { id: 'management', label: 'Administração', icon: Settings2 },
  ] as const
  const authorizedNavigation = navigation.filter(
    ({ id }) =>
      (id !== 'management' || canManage || !organizationId) &&
      (id !== 'assistant' || canWrite),
  )
  function navigate(next: View) {
    setView(next)
    setMobileMenu(false)
  }
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
    if (!mobileMenu) return
    const previousOverflow = document.body.style.overflow
    const menuToggle = menuToggleRef.current
    document.body.style.overflow = 'hidden'
    mobileMenuRef.current
      ?.querySelector<HTMLButtonElement>('.mobile-close')
      ?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileMenu(false)
      if (event.key !== 'Tab' || !mobileMenuRef.current) return
      const focusable = [
        ...mobileMenuRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], select:not([disabled])',
        ),
      ]
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      menuToggle?.focus()
    }
  }, [mobileMenu])
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
        read<Fund[]>(
          `/api/organizations/${organizationId}/funds`,
          controller.signal,
        ),
      ])
        .then(([nextAccounts, nextJournal, nextFunds]) => {
          if (!controller.signal.aborted) {
            setAccounts(nextAccounts)
            setJournal(nextJournal)
            setFunds(nextFunds)
            setLoadedOrganizationId(organizationId)
            setError('')
            setDataError(false)
            setLoading(false)
          }
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) {
            setAccounts([])
            setJournal([])
            setFunds([])
            setLoadedOrganizationId(organizationId)
            setDataError(true)
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
    <div className="app-frame accounting-frame">
      {mobileMenu && (
        <button
          type="button"
          className="accounting-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <header className="workspace-header">
        <div className="brand">
          <div className="brand-logo">
            <ChartNoAxesCombined size={23} strokeWidth={2.3} />
          </div>
          <div>
            <strong>
              personal<span>cfo</span>
            </strong>
          </div>
        </div>
        <label className="organization-select">
          <span className="org-monogram">
            {selectedOrganization?.name.slice(0, 1) ?? '+'}
          </span>
          <span className="organization-select-control">
            <select
              aria-label="Organização"
              title={selectedOrganization?.name ?? 'Organização'}
              value={organizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value)
                navigate('overview')
              }}
            >
              {ownOrganizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </span>
          <ChevronDown size={15} />
        </label>
        <nav className="workspace-nav" aria-label="Navegação principal">
          {authorizedNavigation.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={view === id ? 'active' : ''}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <form action={emailSignOut} className="accounting-signout">
          <button type="submit">Terminar sessão</button>
        </form>
        <button
          ref={menuToggleRef}
          type="button"
          className="menu-toggle"
          onClick={() => setMobileMenu(true)}
          aria-label="Abrir menu"
          aria-expanded={mobileMenu}
        >
          <Menu size={21} />
        </button>
      </header>
      {mobileMenu && (
        <div
          ref={mobileMenuRef}
          className="workspace-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu principal"
        >
          <button
            type="button"
            className="mobile-close"
            onClick={() => setMobileMenu(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
          <nav aria-label="Navegação principal">
            {authorizedNavigation.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={view === id ? 'page' : undefined}
                onClick={() => navigate(id)}
              >
                <Icon size={18} /> {label}
              </button>
            ))}
          </nav>
          <form action={emailSignOut} className="accounting-signout">
            <button type="submit">Terminar sessão</button>
          </form>
        </div>
      )}
      <div className="workspace-context">
        <span>{selectedOrganization?.name ?? 'Personal CFO'}</span>
        <span aria-hidden="true">/</span>
        <strong>{navigation.find((item) => item.id === view)?.label}</strong>
      </div>
      <main className="main-area accounting-workspace">
        <div className="content-wrap accounting-content">
          {error && <p role="alert">{error}</p>}
          {!organizationId ? (
            <div className="accounting-empty">
              <h1>Cria o teu espaço financeiro</h1>
              <p>Começa por dar um nome à organização que vais gerir.</p>
              <form onSubmit={create}>
                <label>
                  Nome da organização
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
            </div>
          ) : loading || loadedOrganizationId !== organizationId ? (
            <p role="status" className="accounting-loading">
              A preparar o espaço financeiro…
            </p>
          ) : dataError ? (
            <div className="accounting-empty">
              <h1>Não foi possível carregar os dados</h1>
              <p>
                Não mostramos valores até confirmar os dados da organização.
              </p>
              <button
                type="button"
                onClick={() => setRevision((value) => value + 1)}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {view === 'overview' && (
                <>
                  <div className="greeting">
                    <div>
                      <h1>Visão geral</h1>
                      <p>
                        O essencial de {selectedOrganization?.name}, num só
                        lugar.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="overview-action"
                      onClick={() => navigate('movements')}
                    >
                      Novo movimento <ArrowLeftRight size={17} />
                    </button>
                  </div>
                  <div className="accounting-overview-grid">
                    <div>
                      <span>Saldo disponível</span>
                      <strong>{formatEuro(summary.balance / 100)}</strong>
                      <small>Caixa e bancos</small>
                    </div>
                    <div>
                      <span>Entradas este mês</span>
                      <strong>{formatEuro(summary.income / 100)}</strong>
                      <small>Receitas confirmadas</small>
                    </div>
                    <div>
                      <span>Saídas este mês</span>
                      <strong>{formatEuro(summary.expenses / 100)}</strong>
                      <small>Despesas confirmadas</small>
                    </div>
                    <div>
                      <span>Resultado este mês</span>
                      <strong>
                        {formatEuro((summary.income - summary.expenses) / 100)}
                      </strong>
                      <small>Entradas menos saídas</small>
                    </div>
                  </div>
                  <div className="accounting-insights-grid">
                    <section className="accounting-recent accounting-categories">
                      <div className="section-heading">
                        <h2>Despesas por categoria</h2>
                        <button
                          type="button"
                          onClick={() => navigate('reports')}
                        >
                          Ver relatórios
                        </button>
                      </div>
                      {summary.categories.length === 0 ? (
                        <p>Sem despesas confirmadas este mês.</p>
                      ) : (
                        <ul>
                          {summary.categories
                            .slice(0, 5)
                            .map(([category, cents]) => (
                              <li key={category}>
                                <span>{category}</span>
                                <strong>{formatEuro(cents / 100)}</strong>
                              </li>
                            ))}
                        </ul>
                      )}
                    </section>
                    <section className="accounting-recent">
                      <div className="section-heading">
                        <h2>Atividade recente</h2>
                        <button
                          type="button"
                          onClick={() => navigate('journal')}
                        >
                          Ver diário
                        </button>
                      </div>
                      {journal.length === 0 ? (
                        <p>Ainda não existem lançamentos confirmados.</p>
                      ) : (
                        <ul>
                          {journal.slice(0, 5).map((entry) => (
                            <li key={entry.id}>
                              <span>{entry.description}</span>
                              <time>{entry.date}</time>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                </>
              )}
              {view === 'movements' && (
                <div className="accounting-panel">
                  <h1>Movimentos</h1>
                  <p>Regista entradas e saídas e acompanha as alterações.</p>
                  {canWrite && (
                    <MovementForm
                      key={`movement-${organizationId}`}
                      organizationId={organizationId}
                      accounts={accounts}
                      funds={funds}
                      onSaved={() => setRevision((value) => value + 1)}
                      canManage={canManage}
                    />
                  )}
                  <MovementHistory
                    key={`history-${organizationId}`}
                    organizationId={organizationId}
                    accounts={accounts}
                    funds={funds}
                    canEdit={canWrite}
                    canManageReceipts={canManage}
                    receiptStorageConfigured={receiptStorageConfigured}
                    revision={revision}
                    onSaved={() => setRevision((value) => value + 1)}
                  />
                  <RecurrencePanel
                    organizationId={organizationId}
                    role={selectedOrganization?.role ?? 'reader'}
                    accounts={accounts}
                    funds={funds}
                  />
                  <StatementPanel
                    key={`statements-${organizationId}`}
                    organizationId={organizationId}
                    role={selectedOrganization?.role ?? 'reader'}
                    accounts={accounts}
                  />
                </div>
              )}
              {view === 'assistant' && canWrite && (
                <div className="accounting-panel">
                  <h1>Falar com o CFO</h1>
                  <AccountingChat
                    key={`chat-${organizationId}`}
                    organizationId={organizationId}
                    accounts={accounts}
                    onSaved={() => setRevision((value) => value + 1)}
                  />
                </div>
              )}
              {view === 'budget' && (
                <div className="accounting-panel">
                  <h1>Orçamentos</h1>
                  <BudgetPanel
                    key={`budget-${organizationId}`}
                    organizationId={organizationId}
                    role={selectedOrganization?.role ?? 'reader'}
                    accounts={accounts}
                    onAccountsChanged={() => setRevision((value) => value + 1)}
                  />
                  <FundBudgetPanel
                    organizationId={organizationId}
                    role={selectedOrganization?.role ?? 'reader'}
                    funds={funds}
                  />
                  <ForecastPanel organizationId={organizationId} />
                </div>
              )}
              {view === 'journal' && (
                <div className="accounting-panel">
                  <h1>Diário</h1>
                  {canWrite && (
                    <JournalForm
                      key={organizationId}
                      organizationId={organizationId}
                      accounts={accounts}
                      onSaved={() => setRevision((value) => value + 1)}
                    />
                  )}
                  <section>
                    <div className="section-heading">
                      <h2>Diário confirmado</h2>
                      <button
                        type="button"
                        onClick={() => setRevision((value) => value + 1)}
                      >
                        Atualizar diário
                      </button>
                    </div>
                    {journal.length === 0 && (
                      <p>Sem lançamentos confirmados.</p>
                    )}
                    {journal.map((entry) => (
                      <div className="accounting-journal-entry" key={entry.id}>
                        <h3>{entry.description}</h3>
                        <time>{entry.date}</time>
                        <ul>
                          {entry.lines.map((line, index) => (
                            <li key={index}>
                              {line.side === 'debit' ? 'Débito' : 'Crédito'} ·{' '}
                              {accounts.find(
                                (account) => account.id === line.accountId,
                              )?.name ?? 'Conta'}{' '}
                              · {formatEuro(line.amountCents / 100)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </section>
                </div>
              )}
              {view === 'reports' && (
                <div className="accounting-panel">
                  <h1>Relatórios</h1>
                  <ReportPanel
                    key={`reports-${organizationId}`}
                    organizationId={organizationId}
                    accounts={accounts}
                    funds={funds}
                  />
                </div>
              )}
              {view === 'management' && canManage && (
                <div className="accounting-panel">
                  <h1>Administração</h1>
                  <form onSubmit={create}>
                    <h2>Nova organização</h2>
                    <label>
                      Nome da organização
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
                  <AccountManager
                    organizationId={organizationId}
                    accounts={accounts}
                    onSaved={() => setRevision((value) => value + 1)}
                  />
                  <FundManager
                    organizationId={organizationId}
                    funds={funds}
                    onSaved={() => setRevision((value) => value + 1)}
                  />
                  <MemberForm
                    key={`members-${organizationId}`}
                    organizationId={organizationId}
                    owner={selectedOrganization?.role === 'owner'}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function MovementForm({
  organizationId,
  accounts,
  funds,
  onSaved,
  canManage,
}: {
  organizationId: string
  accounts: Account[]
  funds: Fund[]
  onSaved: () => void
  canManage: boolean
}) {
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense')
  const [date, setDate] = useState(() => portugalDate(new Date()))
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [financialAccountId, setFinancialAccountId] = useState('')
  const [counterAccountId, setCounterAccountId] = useState('')
  const [fundId, setFundId] = useState('')
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
            fundId: type === 'transfer' ? null : fundId || null,
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
              if (event.target.value === 'transfer') setFundId('')
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
        {type !== 'transfer' && (
          <label>
            Fundo do movimento{' '}
            <select
              value={fundId}
              onChange={(event) => {
                setFundId(event.target.value)
                edited()
              }}
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
        )}
        {canManage && type !== 'transfer' && (
          <CategoryCreator
            organizationId={organizationId}
            kind={type}
            onCreated={(id) => {
              setCounterAccountId(id)
              onSaved()
            }}
          />
        )}
        <button type="submit" disabled={pending}>
          {pending ? 'A guardar…' : 'Guardar movimento'}
        </button>
      </fieldset>
    </form>
  )
}

function FundManager({
  organizationId,
  funds,
  onSaved,
}: {
  organizationId: string
  funds: Fund[]
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editName, setEditName] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function createFund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/funds`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name }),
        },
      )
      if (!response.ok) throw new Error('Não foi possível criar o fundo.')
      setName('')
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro de ligação.')
    } finally {
      setPending(false)
    }
  }
  async function update(fund: Fund, nextName: string, active: boolean) {
    setPending(true)
    setError('')
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/funds/${fund.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: nextName, active }),
        },
      )
      if (!response.ok) throw new Error('Não foi possível atualizar o fundo.')
      setEditingId('')
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro de ligação.')
    } finally {
      setPending(false)
    }
  }
  return (
    <section>
      <h2>Fundos e projetos</h2>
      <form onSubmit={createFund}>
        <label>
          Nome do fundo{' '}
          <input
            value={name}
            required
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" disabled={pending}>
          Criar fundo
        </button>
      </form>
      <ul>
        {funds.map((fund) => (
          <li key={fund.id}>
            {fund.name} · {fund.active ? 'Ativo' : 'Arquivado'}{' '}
            {editingId === fund.id ? (
              <>
                <label>
                  Novo nome do fundo{' '}
                  <input
                    value={editName}
                    maxLength={100}
                    onChange={(event) => setEditName(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={pending || !editName.trim()}
                  onClick={() => update(fund, editName, fund.active)}
                >
                  Guardar nome
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingId(fund.id)
                  setEditName(fund.name)
                }}
              >
                Renomear {fund.name}
              </button>
            )}{' '}
            <button
              type="button"
              disabled={pending}
              onClick={() => update(fund, fund.name, !fund.active)}
            >
              {fund.active ? 'Arquivar' : 'Reativar'} {fund.name}
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
    </section>
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
