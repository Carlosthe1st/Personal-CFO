'use client'

import { useState } from 'react'

export function CategoryCreator({ organizationId, kind, onCreated }: {
  organizationId: string
  kind: 'income' | 'expense'
  onCreated: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    if (pending || !name.trim()) return
    setPending(true)
    setError('')
    try {
      const response = await fetch(`/api/organizations/${organizationId}/accounts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: `CAT_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
          name: name.trim(),
          kind,
        }),
      })
      if (!response.ok) throw new Error('Não foi possível criar a categoria.')
      const account = (await response.json()) as { id: string }
      onCreated(account.id)
      setName('')
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Serviço indisponível.')
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="category-creator">
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Cancelar nova categoria' : 'Criar categoria'}
      </button>
      {open && <div className="category-creator-fields">
        <label>Nome da nova categoria{' '}
          <input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button type="button" disabled={pending || !name.trim()} onClick={save}>
          {pending ? 'A guardar…' : 'Guardar categoria'}
        </button>
        {error && <p role="alert">{error}</p>}
      </div>}
    </div>
  )
}
