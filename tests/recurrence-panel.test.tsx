// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { RecurrencePanel } from '../src/components/recurrence-panel'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const proposal = {
  ruleId: 'rule-a',
  dueDate: '2026-10-06',
  effectiveDate: '2026-10-06',
  type: 'expense',
  description: 'Renda',
  amountCents: 10000,
}

it('requires an editor click to confirm a proposed movement', async () => {
  const user = userEvent.setup()
  let action: Record<string, unknown> | undefined
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      action = JSON.parse(init.body as string)
      return Response.json({ movementId: 'movement-a' })
    }
    if (url.includes('throughDate')) return Response.json([proposal])
    return Response.json([])
  })
  render(
    <RecurrencePanel
      organizationId="org-a"
      role="editor"
      accounts={[]}
      funds={[]}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Abrir recorrências' }))
  expect(
    await screen.findByRole('button', { name: 'Confirmar Renda' }),
  ).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Confirmar Renda' }))
  expect(action).toMatchObject({ action: 'confirm' })
})

it('does not offer confirmation to readers', async () => {
  const user = userEvent.setup()
  vi.stubGlobal('fetch', async (url: string) =>
    Response.json(url.includes('throughDate') ? [proposal] : []),
  )
  render(
    <RecurrencePanel
      organizationId="org-a"
      role="reader"
      accounts={[]}
      funds={[]}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Abrir recorrências' }))
  expect(await screen.findByText(/Renda/)).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Confirmar Renda' }),
  ).not.toBeInTheDocument()
})
