// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { BudgetPanel } from '../src/components/budget-panel'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('revises annual funds and transfers a monthly category with history', async () => {
  const user = userEvent.setup()
  const sent: Record<string, unknown>[] = []
  let version = 0
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body as string)
      sent.push(body)
      version += 1
      return Response.json({ version })
    }
    return Response.json({
      year: 2026,
      version,
      annualCents: version ? 7000000 : 0,
      plannedCents: version ? '100000' : '0',
      undistributedCents: version ? '6900000' : '0',
      realizedCents: '18000',
      availableCents: version ? '82000' : '-18000',
      warnings: ['deficit'],
      cells: [
        {
          month: 1,
          accountId: 'expense',
          plannedCents: version ? 100000 : 0,
          realizedCents: '18000',
          availableCents: version ? '82000' : '-18000',
        },
      ],
      history: version
        ? [
            {
              id: 'event-a',
              action: 'revise',
              version,
              reason: 'Plano anual',
              createdAt: '2026-10-04',
            },
          ]
        : [],
    })
  })
  render(
    <BudgetPanel
      organizationId="org-a"
      role="owner"
      accounts={[
        { id: 'expense', name: 'Despesas', kind: 'expense', active: true },
      ]}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Abrir orçamento' }))
  expect(await screen.findByText(/Défice/)).toBeInTheDocument()
  await user.clear(screen.getByLabelText('Verba anual em EUR'))
  await user.type(screen.getByLabelText('Verba anual em EUR'), '70000,00')
  await user.click(screen.getByRole('button', { name: 'Guardar verba anual' }))
  expect(sent[0]).toMatchObject({
    action: 'revise',
    expectedVersion: 0,
    annualCents: 7000000,
  })
  await user.selectOptions(
    screen.getByLabelText('Categoria a planear'),
    'expense',
  )
  await user.type(screen.getByLabelText('Alocação em EUR'), '1000,00')
  await user.click(screen.getByRole('button', { name: 'Guardar alocação' }))
  expect(sent[1]).toMatchObject({
    action: 'revise',
    expectedVersion: 1,
    cells: [{ month: 1, accountId: 'expense', plannedCents: 100000 }],
  })
  await user.selectOptions(
    screen.getByLabelText('Categoria de origem'),
    'expense',
  )
  await user.selectOptions(
    screen.getByLabelText('Categoria de destino'),
    'expense',
  )
  await user.selectOptions(screen.getByLabelText('Mês de destino'), '2')
  await user.type(screen.getByLabelText('Transferir em EUR'), '100,00')
  await user.click(screen.getByRole('button', { name: 'Transferir verba' }))
  expect(sent[2]).toMatchObject({
    action: 'transfer',
    expectedVersion: 2,
    from: { month: 1, accountId: 'expense' },
    to: { month: 2, accountId: 'expense' },
    amountCents: 10000,
  })
})
