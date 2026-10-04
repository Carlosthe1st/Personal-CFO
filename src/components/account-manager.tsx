'use client'

import { useState, type FormEvent } from 'react'
import type { AccountKind } from '../db/schema'

export type ManagedAccount = {
  id: string
  code: string
  name: string
  kind?: AccountKind
  active: boolean
  version?: number
}
export function AccountManager({
  organizationId,
  accounts,
  onSaved,
}: {
  organizationId: string
  accounts: ManagedAccount[]
  onSaved: () => void
}) {
  const [selected, setSelected] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('expense')
  const [active, setActive] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    try {
      const account = accounts.find((item) => item.id === selected)
      const response = await fetch(
        `/api/organizations/${organizationId}/accounts${selected ? `/${selected}` : ''}`,
        {
          method: selected ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            code,
            name,
            kind,
            active,
            expectedVersion: account?.version ?? 0,
          }),
        },
      )
      if (!response.ok)
        throw new Error(
          'Não foi possível guardar a conta. Confirma o código e atualiza os dados se outra pessoa os alterou.',
        )
      setSelected('')
      setCode('')
      setName('')
      setKind('expense')
      setActive(true)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Serviço indisponível.')
    } finally {
      setPending(false)
    }
  }
  return (
    <details>
      <summary>Gerir contas e categorias</summary>
      <form onSubmit={submit}>
        {error && <p role="alert">{error}</p>}
        <fieldset disabled={pending}>
          <label>
            Conta a editar{' '}
            <select
              value={selected}
              onChange={(event) => {
                const account = accounts.find(
                  (item) => item.id === event.target.value,
                )
                setSelected(event.target.value)
                setCode(account?.code ?? '')
                setName(account?.name ?? '')
                setKind(account?.kind ?? 'expense')
                setActive(account?.active ?? true)
              }}
            >
              <option value="">Criar nova</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} · {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Código da conta{' '}
            <input
              required
              maxLength={30}
              pattern="[A-Za-z0-9_-]+"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <label>
            Nome da conta ou categoria{' '}
            <input
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Classificação{' '}
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as AccountKind)}
            >
              <option value="expense">Categoria de despesa</option>
              <option value="income">Categoria de receita</option>
              <option value="cash">Caixa</option>
              <option value="bank">Banco</option>
              <option value="asset">Outro ativo</option>
              <option value="liability">Passivo</option>
              <option value="equity">Património / capital próprio</option>
              <option value="other">Por classificar</option>
            </select>
          </label>
          {selected && (
            <label>
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />{' '}
              Conta ativa
            </label>
          )}
          <button type="submit">
            {selected
              ? 'Guardar alterações da conta'
              : 'Criar conta ou categoria'}
          </button>
        </fieldset>
        <p>
          A classificação altera a apresentação dos relatórios e orçamentos,
          incluindo o histórico. Desativar uma conta preserva os lançamentos
          existentes.
        </p>
      </form>
    </details>
  )
}
