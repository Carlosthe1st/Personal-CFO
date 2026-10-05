'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import {
  parseStatementCsv,
  readCsv,
  type CsvMapping,
  type StatementRow,
} from '../lib/statement-csv'

type Account = { id: string; name: string; kind?: string; active: boolean }
type PreviewRow = StatementRow & { duplicate: boolean }
type BankLine = StatementRow & {
  id: string
  matchedEntryId: string | null
  version: number
}
type Candidate = {
  id: string
  date: string
  description: string
  amountCents: string
}
function money(cents: string | number) {
  const value = BigInt(cents),
    absolute = value < BigInt(0) ? -value : value
  return `${value < BigInt(0) ? '−' : ''}${new Intl.NumberFormat('pt-PT').format(absolute / BigInt(100))},${String(absolute % BigInt(100)).padStart(2, '0')} €`
}
export function StatementPanel({
  organizationId,
  role,
  accounts,
}: {
  organizationId: string
  role: string
  accounts: Account[]
}) {
  const financialAccounts = accounts.filter((account) =>
    ['cash', 'bank'].includes(account.kind ?? ''),
  )
  const [accountId, setAccountId] = useState('')
  const selectedAccount = accountId || financialAccounts[0]?.id || ''
  const [csv, setCsv] = useState('')
  const [delimiter, setDelimiter] = useState<',' | ';'>(';')
  const [decimal, setDecimal] = useState<',' | '.'>(',')
  const [dateColumn, setDateColumn] = useState('0')
  const [descriptionColumn, setDescriptionColumn] = useState('1')
  const [amountColumn, setAmountColumn] = useState('2')
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [includeDuplicates, setIncludeDuplicates] = useState(false)
  const [lines, setLines] = useState<BankLine[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [matches, setMatches] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const key = useRef(crypto.randomUUID())
  const canEdit = role === 'owner' || role === 'admin'
  let headers: string[] = []
  try {
    headers = csv ? (readCsv(csv, delimiter)[0] ?? []) : []
  } catch {
    headers = []
  }
  function changed() {
    setPreview([])
    setMessage('')
    key.current = crypto.randomUUID()
  }
  async function fileChanged(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 1_000_000) {
      setError('O CSV excede o limite de 1 MB.')
      return
    }
    setCsv(await file.text())
    setError('')
    changed()
  }
  async function refresh() {
    if (!selectedAccount) return
    const response = await fetch(
      `/api/organizations/${organizationId}/statements?${new URLSearchParams({ accountId: selectedAccount })}`,
      { cache: 'no-store' },
    )
    if (!response.ok) throw new Error('Não foi possível consultar o extrato.')
    const data = (await response.json()) as {
      lines: BankLine[]
      candidates: Candidate[]
    }
    setLines(data.lines)
    setCandidates(data.candidates)
  }
  async function previewCsv() {
    if (pending) return
    setPending(true)
    setError('')
    setMessage('')
    try {
      const mapping: CsvMapping = {
        delimiter,
        decimal,
        date: Number(dateColumn),
        description: Number(descriptionColumn),
        amount: Number(amountColumn),
      }
      const rows = parseStatementCsv(csv, mapping)
      const response = await fetch(
        `/api/organizations/${organizationId}/statements`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'preview',
            accountId: selectedAccount,
            rows,
          }),
        },
      )
      if (!response.ok)
        throw new Error('Não foi possível verificar os duplicados.')
      setPreview(await response.json())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CSV inválido.')
    } finally {
      setPending(false)
    }
  }
  async function confirmImport() {
    if (!preview.length || pending) return
    setPending(true)
    setError('')
    try {
      const rows = preview.map((row) => ({
        date: row.date,
        description: row.description,
        amountCents: row.amountCents,
      }))
      const response = await fetch(
        `/api/organizations/${organizationId}/statements`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'import',
            accountId: selectedAccount,
            rows,
            idempotencyKey: key.current,
            includeDuplicates,
          }),
        },
      )
      if (!response.ok)
        throw new Error(
          'Não foi possível importar. Verifica permissões e duplicados.',
        )
      const result = (await response.json()) as {
        imported: number
        skipped: number
      }
      setMessage(
        `${result.imported} linhas importadas; ${result.skipped} duplicados ignorados.`,
      )
      key.current = crypto.randomUUID()
      setPreview([])
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Serviço indisponível.')
    } finally {
      setPending(false)
    }
  }
  async function match(line: BankLine, entryId: string | null) {
    if (pending) return
    setPending(true)
    setError('')
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/statements/${line.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            accountId: selectedAccount,
            entryId,
            expectedVersion: line.version,
          }),
        },
      )
      if (!response.ok)
        throw new Error(
          'Não foi possível conciliar. Confirma o valor e atualiza os dados.',
        )
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Serviço indisponível.')
    } finally {
      setPending(false)
    }
  }
  return (
    <details>
      <summary>Extratos CSV e conciliação</summary>
      <label>
        Conta do extrato{' '}
        <select
          value={selectedAccount}
          onChange={(event) => {
            setAccountId(event.target.value)
            changed()
            setLines([])
            setCandidates([])
          }}
        >
          {financialAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() =>
          refresh().catch((cause: unknown) =>
            setError(
              cause instanceof Error ? cause.message : 'Serviço indisponível.',
            ),
          )
        }
      >
        Consultar linhas e lançamentos
      </button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {canEdit && (
        <>
          <p>
            Escolhe um CSV com cabeçalho, mapeia as colunas e revê antes de
            importar. A importação não cria lançamentos contabilísticos.
          </p>
          <label>
            Ficheiro CSV{' '}
            <input type="file" accept=".csv,text/csv" onChange={fileChanged} />
          </label>
          {csv && (
            <>
              <label>
                Separador{' '}
                <select
                  value={delimiter}
                  onChange={(event) => {
                    setDelimiter(event.target.value as ',' | ';')
                    changed()
                  }}
                >
                  <option value=";">Ponto e vírgula</option>
                  <option value=",">Vírgula</option>
                </select>
              </label>
              <label>
                Decimal{' '}
                <select
                  value={decimal}
                  onChange={(event) => {
                    setDecimal(event.target.value as ',' | '.')
                    changed()
                  }}
                >
                  <option value=",">Vírgula</option>
                  <option value=".">Ponto</option>
                </select>
              </label>
              {(
                [
                  ['Coluna da data', dateColumn, setDateColumn],
                  [
                    'Coluna da descrição',
                    descriptionColumn,
                    setDescriptionColumn,
                  ],
                  ['Coluna do valor', amountColumn, setAmountColumn],
                ] as const
              ).map(([label, value, setter]) => (
                <label key={label}>
                  {label}{' '}
                  <select
                    value={value}
                    onChange={(event) => {
                      setter(event.target.value)
                      changed()
                    }}
                  >
                    {headers.map((header, index) => (
                      <option key={index} value={index}>
                        {header || `Coluna ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button
                type="button"
                disabled={pending || !selectedAccount}
                onClick={previewCsv}
              >
                Pré-visualizar extrato
              </button>
            </>
          )}
          {preview.length > 0 && (
            <>
              <p>
                {preview.length} linhas encontradas;{' '}
                {preview.filter((row) => row.duplicate).length} possíveis
                duplicados.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Valor</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((row, index) => (
                    <tr key={index}>
                      <td>{row.date}</td>
                      <td>{row.description}</td>
                      <td>{money(row.amountCents)}</td>
                      <td>{row.duplicate ? 'Possível duplicado' : 'Novo'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 20 && (
                <p>Mostram-se as primeiras 20 linhas de {preview.length}.</p>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={includeDuplicates}
                  onChange={(event) => {
                    setIncludeDuplicates(event.target.checked)
                    key.current = crypto.randomUUID()
                  }}
                />{' '}
                Importar também duplicados após confirmar
              </label>
              <button type="button" disabled={pending} onClick={confirmImport}>
                Confirmar importação
              </button>
              <button type="button" onClick={() => setPreview([])}>
                Cancelar pré-visualização
              </button>
            </>
          )}
        </>
      )}
      <h3>Linhas por conciliar</h3>
      {lines.length === 0 && <p>Sem linhas importadas nesta conta.</p>}
      {lines.map((line) => (
        <div key={line.id}>
          <p>
            {line.date} · {line.description} · {money(line.amountCents)} ·{' '}
            {line.matchedEntryId ? 'Conciliada' : 'Por conciliar'}
          </p>
          {canEdit && (
            <>
              <label>
                Lançamento correspondente{' '}
                <select
                  value={matches[line.id] ?? line.matchedEntryId ?? ''}
                  onChange={(event) =>
                    setMatches((current) => ({
                      ...current,
                      [line.id]: event.target.value,
                    }))
                  }
                >
                  <option value="">Selecionar</option>
                  {candidates
                    .filter(
                      (candidate) =>
                        BigInt(candidate.amountCents) ===
                        BigInt(line.amountCents),
                    )
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.date} · {candidate.description} ·{' '}
                        {money(candidate.amountCents)}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                disabled={pending || !(matches[line.id] ?? line.matchedEntryId)}
                onClick={() =>
                  match(line, matches[line.id] ?? line.matchedEntryId)
                }
              >
                Conciliar
              </button>
              {line.matchedEntryId && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => match(line, null)}
                >
                  Desfazer conciliação
                </button>
              )}
            </>
          )}
        </div>
      ))}
    </details>
  )
}
