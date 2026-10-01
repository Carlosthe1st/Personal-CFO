import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowUpRight as ArrowNorthEast,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileQuestion,
  Wallet,
} from 'lucide-react'
import type { Transaction } from '@/domain/models'
import type { Overview } from '@/lib/finance'
import { formatEuro } from '@/lib/finance'
import { SectionHeading, StatusPill } from './ui'

const barColors = ['#1a735c', '#b9d9b9', '#89b4a0', '#d7e4d8', '#e9ede6']

export function Dashboard({
  overview,
  transactions,
  onReview,
  onShowAll,
}: {
  overview: Overview
  transactions: Transaction[]
  onReview: () => void
  onShowAll: () => void
}) {
  const recent = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)
  const maxCategory = overview.categoryTotals[0]?.amount ?? 1
  return (
    <>
      <div className="metrics-grid">
        <div className="metric-card metric-primary">
          <div className="metric-icon">
            <Wallet size={19} />
          </div>
          <p>
            Saldo disponível <span className="demo-mark">estimado</span>
          </p>
          <strong>{formatEuro(overview.balance)}</strong>
          <span className="metric-foot">
            Com base nos movimentos registados
          </span>
        </div>
        <div className="metric-card">
          <div className="metric-icon mint">
            <ArrowDownLeft size={19} />
          </div>
          <p>Entradas este mês</p>
          <strong>{formatEuro(overview.income)}</strong>
          <span className="metric-foot positive">↗ Movimentos recebidos</span>
        </div>
        <div className="metric-card">
          <div className="metric-icon cream">
            <ArrowUpRight size={19} />
          </div>
          <p>Saídas este mês</p>
          <strong>{formatEuro(overview.expenses)}</strong>
          <span className="metric-foot">Movimentos registados</span>
        </div>
        <button className="metric-card metric-button" onClick={onReview}>
          <div className="metric-icon peach">
            <FileQuestion size={19} />
          </div>
          <p>À tua atenção</p>
          <strong>
            {overview.reviewCount} <span className="item-word">itens</span>
          </strong>
          <span className="metric-foot review-link">
            Ver o que falta <ChevronRight size={14} />
          </span>
        </button>
      </div>
      <div className="insight-grid">
        <section className="surface insight-card">
          <SectionHeading eyebrow="ESTE MÊS" title="Fluxo de caixa" />
          <div className="cashflow-value">
            {formatEuro(overview.net)}{' '}
            <span className={overview.net >= 0 ? 'trend-up' : 'trend-down'}>
              {overview.net >= 0 ? 'Saldo positivo' : 'Saldo negativo'}
            </span>
          </div>
          <div
            className="flow-chart"
            aria-label={`Entradas ${formatEuro(overview.income)}; saídas ${formatEuro(overview.expenses)}`}
          >
            <div className="flow-row">
              <span>Entradas</span>
              <div>
                <i
                  style={{
                    width: `${Math.max((overview.income / Math.max(overview.income, overview.expenses, 1)) * 100, 3)}%`,
                  }}
                />
              </div>
              <b>{formatEuro(overview.income)}</b>
            </div>
            <div className="flow-row expense">
              <span>Saídas</span>
              <div>
                <i
                  style={{
                    width: `${Math.max((overview.expenses / Math.max(overview.income, overview.expenses, 1)) * 100, 3)}%`,
                  }}
                />
              </div>
              <b>{formatEuro(overview.expenses)}</b>
            </div>
          </div>
          <p className="card-caption">
            O que entrou e saiu da tua organização.
          </p>
        </section>
        <section className="surface insight-card">
          <SectionHeading eyebrow="VISÃO GERAL" title="Onde estás a gastar" />
          <div className="category-list">
            {overview.categoryTotals.slice(0, 4).map((item, index) => (
              <div className="category-row" key={item.category}>
                <span className="category-name">
                  <i style={{ background: barColors[index] }} />
                  {item.category}
                </span>
                <span>{formatEuro(item.amount)}</span>
                <div className="category-track">
                  <i
                    style={{
                      width: `${(item.amount / maxCategory) * 100}%`,
                      background: barColors[index],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="surface activity-card">
        <SectionHeading
          eyebrow="MOVIMENTOS"
          title="Atividade recente"
          action={
            <button className="text-action" onClick={onShowAll}>
              Ver todos <ArrowNorthEast size={15} />
            </button>
          }
        />
        <div className="transaction-list">
          {recent.map((item) => (
            <TransactionRow key={item.id} transaction={item} />
          ))}
        </div>
      </section>
    </>
  )
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const income = transaction.type === 'income'
  return (
    <div className="transaction-row">
      <div className={`transaction-icon ${income ? 'incoming' : ''}`}>
        {income ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}
      </div>
      <div className="transaction-main">
        <strong>{transaction.description}</strong>
        <span>
          {transaction.category} <span className="middle-dot">·</span>{' '}
          {new Date(`${transaction.date}T12:00:00`).toLocaleDateString(
            'pt-PT',
            { day: 'numeric', month: 'short' },
          )}
        </span>
      </div>
      <StatusPill status={transaction.accountingStatus} />
      <strong className={`transaction-amount ${income ? 'positive' : ''}`}>
        {income ? '+' : '−'}
        {formatEuro(transaction.amount)}
      </strong>
    </div>
  )
}

export function ReviewQueue({
  transactions,
  onMarkSeen,
}: {
  transactions: Transaction[]
  onMarkSeen: (id: string) => void
}) {
  const pending = transactions.filter(
    (item) =>
      item.accountingStatus === 'needs_review' ||
      item.accountingStatus === 'suggested',
  )
  return (
    <section className="surface review-card">
      <SectionHeading
        eyebrow="POR RESOLVER"
        title="A rever"
        action={<span className="count-badge">{pending.length}</span>}
      />
      {pending.length ? (
        pending.map((item) => (
          <div className="review-item" key={item.id}>
            <div className="review-emblem">
              <Clock3 size={19} />
            </div>
            <div>
              <strong>{item.description}</strong>
              <p>Classificação a confirmar · Documento não associado</p>
            </div>
            <strong>{formatEuro(item.amount)}</strong>
            <button onClick={() => onMarkSeen(item.id)}>
              Marcar como visto <CheckCircle2 size={15} />
            </button>
          </div>
        ))
      ) : (
        <p className="empty-state">Tudo em dia. Não tens itens por rever.</p>
      )}
      <p className="review-note">
        “Visto” significa apenas que confirmaste o registo. A validação
        contabilística e fiscal permanece com o contabilista.
      </p>
    </section>
  )
}
