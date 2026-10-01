'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Bell,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  FileText,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Search,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react'
import { organizations, createDemoTransactions } from '@/data/demo'
import type { Transaction } from '@/domain/models'
import { calculateOverview, formatEuro } from '@/lib/finance'
import { interpretMessage, type Interpretation } from '@/lib/interpret'
import { acknowledgeTransaction } from '@/lib/review'
import { loadTransactions, saveTransactions } from '@/lib/storage'
import { ChatPanel } from './chat-panel'
import { Dashboard, ReviewQueue, TransactionRow } from './dashboard'
import { SectionHeading } from './ui'

type View = 'overview' | 'transactions' | 'review'

export function AppShell() {
  const [organizationId, setOrganizationId] = useState(organizations[0].id)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const [persistenceBlocked, setPersistenceBlocked] = useState(false)
  const [view, setView] = useState<View>('overview')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [search, setSearch] = useState('')
  const organization =
    organizations.find((item) => item.id === organizationId) ?? organizations[0]

  useEffect(() => {
    queueMicrotask(() => {
      const loaded = loadTransactions(createDemoTransactions(new Date()))
      setTransactions(loaded.transactions)
      setPersistenceBlocked(!loaded.canSave)
      setStorageError(!loaded.canSave)
      setReady(true)
    })
  }, [])
  useEffect(() => {
    if (ready && !persistenceBlocked)
      queueMicrotask(() => setStorageError(!saveTransactions(transactions)))
  }, [ready, transactions, persistenceBlocked])
  const own = useMemo(
    () => transactions.filter((item) => item.organizationId === organizationId),
    [transactions, organizationId],
  )
  const overview = calculateOverview(
    transactions,
    organizationId,
    organization.openingBalance,
    new Date(),
  )

  function navigate(next: View) {
    setView(next)
    setMobileMenu(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function confirm(transaction: Transaction) {
    setTransactions((current) => [transaction, ...current])
    setView('overview')
  }
  function markSeen(id: string) {
    setTransactions((current) =>
      current.map((item) =>
        item.id === id ? acknowledgeTransaction(item, new Date()) : item,
      ),
    )
  }
  function interpret(message: string): Interpretation {
    if (/quanto.*gast|quanto.*sa[ií]|despesas.*m[eê]s/i.test(message))
      return {
        kind: 'question',
        reply: `Até agora, tens ${formatEuro(overview.expenses)} em saídas registadas este mês. Este valor baseia-se apenas nos movimentos aqui guardados.`,
      }
    if (/quanto.*entr|quanto.*receb/i.test(message))
      return {
        kind: 'question',
        reply: `Tens ${formatEuro(overview.income)} em entradas registadas este mês.`,
      }
    return interpretMessage(message, organizationId, new Date())
  }

  return (
    <div className="app-frame">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-logo">
            <ChartNoAxesCombined size={23} strokeWidth={2.3} />
          </div>
          <div>
            <strong>
              personal<span>cfo</span>
            </strong>
            <small>FINANÇAS COM CLAREZA</small>
          </div>
          <button
            className="mobile-close"
            onClick={() => setMobileMenu(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-label">ESPAÇO DE TRABALHO</div>
        <label className="organization-select">
          <span className="org-monogram">{organization.name.slice(0, 1)}</span>
          <span>
            <small>Organização</small>
            <select
              aria-label="Selecionar organização"
              value={organizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value)
                navigate('overview')
              }}
            >
              {organizations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </span>
          <ChevronDown size={15} />
        </label>
        <div className="sidebar-label nav-label">MENU PRINCIPAL</div>
        <nav className="side-nav" aria-label="Navegação principal">
          <button
            className={view === 'overview' ? 'active' : ''}
            onClick={() => navigate('overview')}
          >
            <LayoutDashboard size={18} /> Visão geral
          </button>
          <button
            onClick={() => {
              navigate('overview')
              setTimeout(
                () =>
                  document
                    .getElementById('chat')
                    ?.scrollIntoView({ behavior: 'smooth' }),
                100,
              )
            }}
          >
            <MessageSquareText size={18} /> Falar com o CFO{' '}
            <span className="nav-sparkle">
              <Sparkles size={14} />
            </span>
          </button>
          <button
            className={view === 'transactions' ? 'active' : ''}
            onClick={() => navigate('transactions')}
          >
            <ArrowRight size={18} /> Movimentos
          </button>
          <button
            className={view === 'review' ? 'active' : ''}
            onClick={() => navigate('review')}
          >
            <FileText size={18} /> A rever{' '}
            {overview.reviewCount > 0 && (
              <span className="nav-count">{overview.reviewCount}</span>
            )}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <CircleHelp size={18} />
            <span>
              Precisas de ajuda?<small>Estamos aqui para simplificar.</small>
            </span>
            <ArrowRight size={15} />
          </div>
          <div className="sidebar-profile">
            <div className="profile-avatar">CN</div>
            <span>
              <strong>Conta de demonstração</strong>
              <small>Administrador</small>
            </span>
            <Settings2 size={17} />
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="top-left">
            <button
              className="menu-toggle"
              onClick={() => setMobileMenu(true)}
              aria-label="Abrir menu"
            >
              <Menu size={21} />
            </button>
            <span>O teu espaço financeiro</span>
            <span className="top-divider">/</span>
            <strong>
              {view === 'overview'
                ? 'Visão geral'
                : view === 'transactions'
                  ? 'Movimentos'
                  : 'A rever'}
            </strong>
          </div>
          <div className="top-actions">
            <span className="demo-badge">
              <i /> MODO DEMO
            </span>
            <button
              title="Pesquisa disponível em Movimentos"
              onClick={() => navigate('transactions')}
              aria-label="Pesquisar movimentos"
            >
              <Search size={18} />
            </button>
            <button title="Sem notificações" aria-label="Notificações">
              <Bell size={18} />
            </button>
            <div className="top-avatar">CN</div>
          </div>
        </header>
        <div className="content-wrap">
          {storageError && (
            <div className="storage-warning">
              {persistenceBlocked
                ? 'Não foi possível ler os dados guardados. Foram preservados e a gravação está suspensa. Verifica o armazenamento antes de continuar.'
                : 'Não foi possível guardar neste navegador. Verifica as definições de armazenamento antes de continuar.'}
            </div>
          )}
          {view === 'overview' ? (
            <>
              <div className="greeting">
                <div>
                  <span className="eyebrow">O TEU CENTRO FINANCEIRO</span>
                  <h1>
                    Bom dia, Carlos<span className="wave">✳</span>
                  </h1>
                  <p>
                    Aqui está o que se passa com as finanças da tua organização.
                  </p>
                </div>
                <div className="greeting-date">
                  {new Intl.DateTimeFormat('pt-PT', {
                    timeZone: 'Europe/Lisbon',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }).format(new Date())}
                </div>
              </div>
              <div className="hero-card">
                <div className="hero-copy">
                  <span>
                    <Sparkles size={16} /> O TEU CFO DE BOLSO
                  </span>
                  <h2>
                    Menos números soltos.
                    <br />
                    <em>Mais clareza para decidir.</em>
                  </h2>
                  <p>
                    Conta-me o que aconteceu no teu negócio. Eu ajudo a pôr tudo
                    em ordem.
                  </p>
                  <button
                    onClick={() =>
                      document
                        .getElementById('chat')
                        ?.scrollIntoView({ behavior: 'smooth' })
                    }
                  >
                    Falar com o Personal CFO <ArrowRight size={17} />
                  </button>
                </div>
                <div className="hero-visual" aria-hidden="true">
                  <div className="orbit orbit-1" />
                  <div className="orbit orbit-2" />
                  <div className="hero-stat">
                    <span>Visão em tempo real</span>
                    <strong>{formatEuro(overview.balance)}</strong>
                    <div>
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                </div>
              </div>
              {ready ? (
                <Dashboard
                  overview={overview}
                  transactions={own}
                  onReview={() => navigate('review')}
                  onShowAll={() => navigate('transactions')}
                />
              ) : (
                <div className="loading-block">
                  A preparar a tua visão financeira…
                </div>
              )}
              <div className="section-spacer">
                <SectionHeading
                  eyebrow="SIMPLES COMO UMA CONVERSA"
                  title="O teu espaço de conversa"
                />
              </div>
              <ChatPanel onInterpret={interpret} onConfirm={confirm} />
              <p className="footer-note">
                Personal CFO é uma ferramenta de organização financeira. As
                sugestões não substituem o teu contabilista.
              </p>
            </>
          ) : view === 'transactions' ? (
            <>
              <div className="page-heading">
                <span className="eyebrow">TODOS OS MOVIMENTOS</span>
                <h1>Movimentos</h1>
                <p>Uma vista simples de tudo o que entrou e saiu.</p>
              </div>
              <section className="surface list-page">
                <SectionHeading
                  title={`${own.length} movimentos`}
                  action={
                    <input
                      className="search-input"
                      placeholder="Pesquisar descrição..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      aria-label="Pesquisar movimentos"
                    />
                  }
                />
                <div className="transaction-list">
                  {[...own]
                    .filter((item) =>
                      item.description
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((item) => (
                      <TransactionRow key={item.id} transaction={item} />
                    ))}
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="page-heading">
                <span className="eyebrow">MANTÉM TUDO EM DIA</span>
                <h1>Itens a rever</h1>
                <p>Confirma os movimentos que precisam da tua atenção.</p>
              </div>
              <ReviewQueue transactions={own} onMarkSeen={markSeen} />
            </>
          )}
        </div>
      </main>
    </div>
  )
}
