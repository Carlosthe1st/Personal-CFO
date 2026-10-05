// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { FundBudgetPanel } from '../src/components/budget-panel'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('shows fund allocations and sends a manual revision', async () => {
  const user = userEvent.setup()
  let payload: Record<string, unknown> | undefined
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      payload = JSON.parse(init.body as string)
      return Response.json({ id: 'event-a' })
    }
    return Response.json({
      year: 2026,
      funds: [{ id: 'fund-a', name: 'Missões', active: true }],
      cells: [
        {
          fundId: 'fund-a',
          month: 10,
          plannedCents: 10000,
          realizedCents: '500',
          availableCents: '9500',
        },
      ],
      events: [],
      annualCents: '7000000',
      plannedCents: '10000',
      warnings: [],
    })
  })
  render(
    <FundBudgetPanel
      organizationId="org-a"
      role="owner"
      funds={[{ id: 'fund-a', name: 'Missões', active: true, version: 1 }]}
    />,
  )
  await user.click(
    screen.getByRole('button', { name: 'Abrir verbas por fundo' }),
  )
  expect(await screen.findByText(/Missões.*Outubro/)).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Fundo a planear'), 'fund-a')
  await user.selectOptions(screen.getByLabelText('Mês a planear'), '10')
  await user.type(screen.getByLabelText('Verba do fundo em EUR'), '200,00')
  await user.type(
    screen.getByLabelText('Motivo da revisão do fundo'),
    'Plano revisto',
  )
  await user.click(
    screen.getByRole('button', { name: 'Guardar verba do fundo' }),
  )
  expect(payload).toMatchObject({
    mode: 'revise',
    to: { fundId: 'fund-a', month: 10 },
    amountCents: 20000,
  })
})
