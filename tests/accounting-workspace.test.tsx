// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AccountingWorkspace } from '../src/components/accounting-workspace'
import userEvent from '@testing-library/user-event'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const organizations = [
  { id: 'org-a', name: 'Atelier', role: 'reader' as const },
]
const entry = {
  id: 'entry-a',
  date: '2026-10-02',
  description: 'Combustível',
  status: 'posted',
  actorId: 'user-a',
  lines: [
    { accountId: 'cash', side: 'debit', amountCents: 18000 },
    { accountId: 'expense', side: 'credit', amountCents: 18000 },
  ],
  events: [{ action: 'journal.posted' }],
}
describe('accounting workspace', () => {
  it('lets an owner add a registered member with a selected role', async () => {
    const user = userEvent.setup()
    const submitted: unknown[] = []
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        submitted.push(JSON.parse(init.body as string))
        return Response.json({ role: 'reader' })
      }
      return Response.json([])
    })
    render(
      <AccountingWorkspace
        organizations={[{ ...organizations[0], role: 'owner' }]}
      />,
    )
    await user.type(
      await screen.findByLabelText('Email do membro'),
      'member@example.test',
    )
    await user.click(screen.getByRole('button', { name: 'Guardar membro' }))
    expect(await screen.findByText('Membro atualizado.')).toBeInTheDocument()
    expect(submitted).toEqual([
      { email: 'member@example.test', role: 'reader' },
    ])
  })
  it('lets a reader consult the journal without a submit control', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      Response.json(
        url.endsWith('/accounts')
          ? [
              { id: 'cash', name: 'Caixa', code: 'CAIXA', active: true },
              {
                id: 'expense',
                name: 'Despesas',
                code: 'DESPESA',
                active: true,
              },
            ]
          : [entry],
      ),
    )
    render(<AccountingWorkspace organizations={organizations} />)
    expect(await screen.findByText('Combustível')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Confirmar lançamento' }),
    ).not.toBeInTheDocument()
  })
  it('retains the form and operation key after a 503, then displays one posted entry after retry and refresh', async () => {
    const user = userEvent.setup()
    const operations: string[] = []
    let saved = false
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(init.body as string)
        operations.push(body.idempotencyKey)
        expect(
          body.lines.map((line: { amountCents: number }) => line.amountCents),
        ).toEqual([18000, 18000])
        if (operations.length === 1)
          return Response.json(
            { error: 'Serviço indisponível.' },
            { status: 503 },
          )
        saved = true
        return Response.json({ id: 'entry-a' }, { status: 201 })
      }
      return Response.json(
        url.endsWith('/accounts')
          ? [
              { id: 'cash', name: 'Caixa', code: 'CAIXA', active: true },
              {
                id: 'expense',
                name: 'Despesas',
                code: 'DESPESA',
                active: true,
              },
            ]
          : saved
            ? [entry]
            : [],
      )
    })
    render(
      <AccountingWorkspace
        organizations={[{ ...organizations[0], role: 'editor' }]}
      />,
    )
    const submit = await screen.findByRole('button', {
      name: 'Confirmar lançamento',
    })
    await user.type(screen.getByLabelText('Descrição'), 'Combustível')
    await user.type(screen.getByLabelText('Valor em EUR'), '180,00')
    await user.selectOptions(screen.getByLabelText('Conta a debitar'), 'cash')
    await user.selectOptions(
      screen.getByLabelText('Conta a creditar'),
      'expense',
    )
    await user.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Serviço indisponível',
    )
    expect(screen.getByLabelText('Descrição')).toHaveValue('Combustível')
    expect(screen.getByLabelText('Valor em EUR')).toHaveValue('180,00')
    await user.click(submit)
    expect(
      await screen.findByRole('heading', { name: 'Combustível' }),
    ).toBeInTheDocument()
    expect(operations[0]).toBe(operations[1])
    await user.click(screen.getByRole('button', { name: 'Atualizar diário' }))
    expect(
      await screen.findByRole('heading', { name: 'Combustível' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('heading', { name: 'Combustível' }),
    ).toHaveLength(1)
  })
  it('creates the first organization without replacing the demo', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url === '/api/organizations' && init?.method === 'POST')
        return Response.json(
          { id: 'org-new', name: 'Novo atelier' },
          { status: 201 },
        )
      return Response.json([])
    })
    render(<AccountingWorkspace organizations={[]} />)
    await user.type(
      screen.getByLabelText('Nome da organização'),
      'Novo atelier',
    )
    await user.click(screen.getByRole('button', { name: 'Criar organização' }))
    expect(
      await screen.findByRole('option', { name: 'Novo atelier' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Voltar à demonstração' }),
    ).toHaveAttribute('href', '/')
  })
})
