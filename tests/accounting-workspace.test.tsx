// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  render,
  screen,
  cleanup,
  within,
  waitFor,
} from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AccountingWorkspace } from '../src/components/accounting-workspace'
import userEvent from '@testing-library/user-event'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.head.querySelector('#test-workspace-styles')?.remove()
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
  it('uses the approved sand surface for the financial workspace', () => {
    const styles = document.createElement('style')
    styles.id = 'test-workspace-styles'
    styles.textContent = readFileSync(
      resolve('src/app/globals.css'),
      'utf8',
    ).replace("@import 'tailwindcss';", '')
    document.head.append(styles)
    vi.stubGlobal('fetch', async () => Response.json([]))
    render(<AccountingWorkspace organizations={organizations} />)
    expect(getComputedStyle(screen.getByRole('main')).backgroundColor).toBe(
      'rgb(247, 246, 244)',
    )
  })
  it('keeps the authorized workspace navigation in one horizontal header', () => {
    vi.stubGlobal('fetch', async () => Response.json([]))
    render(<AccountingWorkspace organizations={organizations} />)
    const banner = screen.getByRole('banner')
    expect(
      within(banner).getByRole('navigation', { name: 'Navegação principal' }),
    ).toBeInTheDocument()
    expect(
      within(banner).getByRole('combobox', { name: 'Organização' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Falar com o CFO' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Administração' })).toBeNull()
  })
  it('returns to overview and loads the selected organization', async () => {
    const user = userEvent.setup()
    const urls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url)
      return Response.json([])
    })
    render(
      <AccountingWorkspace
        organizations={[
          organizations[0],
          { id: 'org-b', name: 'Comunidade', role: 'reader' },
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Movimentos' }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Organização' }),
      'org-b',
    )
    expect(screen.getByRole('button', { name: 'Visão geral' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await waitFor(() =>
      expect(urls).toContain('/api/organizations/org-b/accounts'),
    )
  })
  it('keeps tasks in the same navigation flow instead of showing every form at once', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', async (url: string) =>
      Response.json(url.endsWith('/accounts') ? [] : []),
    )
    render(
      <AccountingWorkspace
        organizations={[{ ...organizations[0], role: 'editor' }]}
      />,
    )
    expect(
      screen.getByRole('navigation', { name: 'Navegação principal' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Novo movimento' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Movimentos' }))
    expect(
      await screen.findByRole('heading', { name: 'Novo movimento' }),
    ).toBeVisible()
  })
  it('shows real financial totals and categories in the overview', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      Response.json(
        url.endsWith('/accounts')
          ? [
              {
                id: 'cash',
                code: 'CAIXA',
                name: 'Caixa',
                kind: 'cash',
                active: true,
              },
              {
                id: 'expense',
                code: 'DESPESA',
                name: 'Despesas',
                kind: 'expense',
                active: true,
              },
            ]
          : [entry],
      ),
    )
    render(<AccountingWorkspace organizations={organizations} />)
    expect(await screen.findAllByText('Saldo disponível')).toHaveLength(1)
    expect(screen.getByText('Saídas este mês')).toBeInTheDocument()
    expect(screen.getByText('Despesas')).toBeInTheDocument()
  })
  it('never presents failed data loads as an empty financial history', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: 'offline' }, { status: 503 }),
    )
    render(<AccountingWorkspace organizations={organizations} />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(
      screen.queryByText('Ainda não existem lançamentos confirmados.'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Tentar novamente' }),
    ).toBeInTheDocument()
  })
  it('closes the mobile menu with Escape and restores focus', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', async () => Response.json([]))
    render(<AccountingWorkspace organizations={organizations} />)
    const toggle = screen.getByRole('button', { name: 'Abrir menu' })
    expect(
      within(screen.getByRole('banner')).getByRole('button', {
        name: 'Abrir menu',
      }),
    ).toBe(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    const dialog = screen.getByRole('dialog', { name: 'Menu principal' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(dialog).getByRole('navigation', { name: 'Navegação principal' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'Falar com o CFO' }),
    ).toBeNull()
    expect(
      within(dialog).queryByRole('button', { name: 'Administração' }),
    ).toBeNull()
    const close = within(dialog).getByRole('button', { name: 'Fechar menu' })
    close.focus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.keyboard('{Escape}')
    expect(
      screen.queryByRole('dialog', { name: 'Menu principal' }),
    ).not.toBeInTheDocument()
    expect(toggle).toHaveFocus()
  })
  it('closes the compact menu after selecting a view', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', async () => Response.json([]))
    render(<AccountingWorkspace organizations={organizations} />)
    await user.click(screen.getByRole('button', { name: 'Abrir menu' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Menu principal' })).getByRole(
        'button',
        { name: 'Movimentos' },
      ),
    )
    expect(screen.queryByRole('dialog', { name: 'Menu principal' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Movimentos' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
  it('records a simple expense through the movements API', async () => {
    const user = userEvent.setup()
    let payload: Record<string, unknown> | undefined
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.endsWith('/movements') && init?.method === 'POST') {
        payload = JSON.parse(init.body as string)
        return Response.json({ id: 'movement-a' }, { status: 201 })
      }
      return Response.json(
        url.endsWith('/accounts')
          ? [
              {
                id: 'cash',
                code: 'CAIXA',
                name: 'Caixa',
                kind: 'cash',
                active: true,
              },
              {
                id: 'expense',
                code: 'DESPESA',
                name: 'Despesas',
                kind: 'expense',
                active: true,
              },
            ]
          : [],
      )
    })
    render(
      <AccountingWorkspace
        organizations={[{ ...organizations[0], role: 'editor' }]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Movimentos' }))
    await user.selectOptions(
      await screen.findByLabelText('Tipo de movimento'),
      'expense',
    )
    await user.type(screen.getByLabelText('Descrição do movimento'), 'Material')
    await user.type(
      screen.getByLabelText('Valor do movimento em EUR'),
      '180,00',
    )
    await user.selectOptions(
      screen.getByLabelText('Conta de origem ou destino'),
      'cash',
    )
    await user.selectOptions(
      screen.getByLabelText('Categoria ou conta de transferência'),
      'expense',
    )
    await user.click(screen.getByRole('button', { name: 'Guardar movimento' }))
    expect(payload).toMatchObject({
      type: 'expense',
      description: 'Material',
      amountCents: 18000,
      financialAccountId: 'cash',
      counterAccountId: 'expense',
    })
    expect(payload?.idempotencyKey).toEqual(expect.any(String))
  })
  it('keeps the selected fund when entering a movement', async () => {
    const user = userEvent.setup()
    let payload: Record<string, unknown> | undefined
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.endsWith('/movements') && init?.method === 'POST') {
        payload = JSON.parse(init.body as string)
        return Response.json({ id: 'movement-a' }, { status: 201 })
      }
      if (url.endsWith('/funds'))
        return Response.json([{ id: 'fund-a', name: 'Missões', active: true }])
      if (url.endsWith('/accounts'))
        return Response.json([
          {
            id: 'bank',
            code: 'BANCO',
            name: 'Banco',
            kind: 'bank',
            active: true,
          },
          {
            id: 'expense',
            code: 'DESPESA',
            name: 'Despesas',
            kind: 'expense',
            active: true,
          },
        ])
      return Response.json([])
    })
    render(
      <AccountingWorkspace
        organizations={[{ ...organizations[0], role: 'editor' }]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Movimentos' }))
    await user.selectOptions(
      await screen.findByLabelText('Fundo do movimento'),
      'fund-a',
    )
    await user.type(screen.getByLabelText('Descrição do movimento'), 'Material')
    await user.type(
      screen.getByLabelText('Valor do movimento em EUR'),
      '100,00',
    )
    await user.selectOptions(
      screen.getByLabelText('Conta de origem ou destino'),
      'bank',
    )
    await user.selectOptions(
      screen.getByLabelText('Categoria ou conta de transferência'),
      'expense',
    )
    await user.click(screen.getByRole('button', { name: 'Guardar movimento' }))
    expect(payload?.fundId).toBe('fund-a')
  })
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
    await user.click(screen.getByRole('button', { name: 'Administração' }))
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
    const user = userEvent.setup()
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
    await user.click(screen.getByRole('button', { name: 'Diário' }))
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
    await user.click(screen.getByRole('button', { name: 'Diário' }))
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
  it('creates the first organization and opens its private workspace', async () => {
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
      screen.getByRole('navigation', { name: 'Navegação principal' }),
    ).toBeInTheDocument()
  })
})
