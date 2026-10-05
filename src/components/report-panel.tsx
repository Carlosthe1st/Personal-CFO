'use client'

import { useState, type FormEvent } from 'react'
import type { getReports } from '../server/reports'
import { portugalDate } from '../lib/date'

type Report = Awaited<ReturnType<typeof getReports>>
function money(value: string) {
  const number = BigInt(value),
    absolute = number < BigInt(0) ? -number : number
  return `${number < BigInt(0) ? '−' : ''}${new Intl.NumberFormat('pt-PT').format(absolute / BigInt(100))},${String(absolute % BigInt(100)).padStart(2, '0')} €`
}
export function ReportPanel({
  organizationId,
  accounts,
}: {
  organizationId: string
  accounts: { id: string; name: string }[]
}) {
  const today = portugalDate(new Date())
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`)
  const [to, setTo] = useState(today)
  const [accountId, setAccountId] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const validPeriod =
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(to) &&
    from <= to
  const exportUrl = (format: 'csv' | 'pdf') =>
    `/api/organizations/${organizationId}/reports/export?${new URLSearchParams({ from, to, accountId, format })}`
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    try {
      const query = new URLSearchParams({ from, to, accountId })
      const response = await fetch(
        `/api/organizations/${organizationId}/reports?${query}`,
        { cache: 'no-store' },
      )
      if (!response.ok)
        throw new Error(
          'Não foi possível consultar os relatórios. Confirma o período.',
        )
      setReport(await response.json())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Serviço indisponível.')
    } finally {
      setPending(false)
    }
  }
  return (
    <details>
      <summary>Relatórios financeiros e razão</summary>
      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <label>
            Relatório desde{' '}
            <input
              type="date"
              required
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            Relatório até{' '}
            <input
              type="date"
              required
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label>
            Conta no razão{' '}
            <select
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">Todas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Consultar relatórios</button>
        </fieldset>
      </form>
      {validPeriod && (
        <p>
          <a href={exportUrl('csv')}>Descarregar CSV</a>
          {' · '}
          <a href={exportUrl('pdf')}>Descarregar PDF</a>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <p>
            Período: {report.from} a {report.to}. Balanço acumulado até{' '}
            {report.to}.
          </p>
          {report.warnings.length > 0 && (
            <p role="alert">
              Existem contas por classificar. Revê a classificação para
              completar o balanço.
            </p>
          )}
          <h3>Demonstração de resultados</h3>
          <p>
            Receitas: {money(report.incomeStatement.incomeCents)} · Despesas:{' '}
            {money(report.incomeStatement.expensesCents)} · Resultado:{' '}
            {money(report.incomeStatement.resultCents)}
          </p>
          <h3>Balanço</h3>
          <p>
            Ativos: {money(report.balanceSheet.assetsCents)} · Passivos:{' '}
            {money(report.balanceSheet.liabilitiesCents)} · Património:{' '}
            {money(report.balanceSheet.equityCents)} · Resultados acumulados:{' '}
            {money(report.balanceSheet.retainedResultCents)}
          </p>
          {report.balanceSheet.differenceCents !== '0' && (
            <p role="alert">
              Diferença a rever: {money(report.balanceSheet.differenceCents)}
            </p>
          )}
          <h3>Balancete</h3>
          <table>
            <thead>
              <tr>
                <th>Conta</th>
                <th>Abertura</th>
                <th>Débitos</th>
                <th>Créditos</th>
                <th>Saldo (D+ / C−)</th>
              </tr>
            </thead>
            <tbody>
              {report.accounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    {account.code} · {account.name}
                  </td>
                  <td>{money(account.openingCents)}</td>
                  <td>{money(account.debitCents)}</td>
                  <td>{money(account.creditCents)}</td>
                  <td>{money(account.balanceCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Movimento do período</th>
                <td></td>
                <td>{money(report.trialBalance.debitCents)}</td>
                <td>{money(report.trialBalance.creditCents)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <h3>Razão do período</h3>
          {report.ledgerTruncated && (
            <p>
              Mostram-se as primeiras 500 linhas. Reduz o período ou seleciona
              uma conta para consultar o restante.
            </p>
          )}
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Conta</th>
                <th>Débito</th>
                <th>Crédito</th>
              </tr>
            </thead>
            <tbody>
              {report.ledger.map((line, index) => (
                <tr key={`${line.entryId}:${index}`}>
                  <td>{line.date}</td>
                  <td>{line.description}</td>
                  <td>
                    {line.code} · {line.name}
                  </td>
                  <td>
                    {line.side === 'debit' ? money(line.amountCents) : '—'}
                  </td>
                  <td>
                    {line.side === 'credit' ? money(line.amountCents) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </details>
  )
}
