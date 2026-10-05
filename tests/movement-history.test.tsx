// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { MovementHistory } from '../src/components/movement-history'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const movement = {
  id: 'movement-a',
  type: 'expense',
  date: '2026-10-05',
  description: 'Material',
  amountCents: 100,
  financialAccountId: 'bank',
  counterAccountId: 'expense',
  status: 'active',
  change: null,
}
const props = {
  organizationId: 'org-a',
  accounts: [],
  revision: 0,
  onSaved: () => {},
}

it('uploads a receipt and shows it in the movement history', async () => {
  const user = userEvent.setup()
  let saved = false
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/movements')) return Response.json([movement])
    if (init?.method === 'POST') {
      saved = true
      return Response.json({
        id: 'receipt-a',
        name: 'fatura.pdf',
        mime: 'application/pdf',
        size: 8,
      })
    }
    return Response.json(
      saved
        ? [
            {
              id: 'receipt-a',
              name: 'fatura.pdf',
              mime: 'application/pdf',
              size: 8,
            },
          ]
        : [],
    )
  })
  render(<MovementHistory {...props} canEdit canManageReceipts />)
  await user.click(
    await screen.findByRole('button', { name: 'Comprovativos de Material' }),
  )
  await user.upload(
    screen.getByLabelText('Comprovativo'),
    new File(['%PDF-1.7'], 'fatura.pdf', { type: 'application/pdf' }),
  )
  await user.click(screen.getByRole('button', { name: 'Anexar comprovativo' }))
  expect(
    await screen.findByRole('link', { name: 'fatura.pdf' }),
  ).toBeInTheDocument()
})

it('lets readers view but not upload receipts', async () => {
  const user = userEvent.setup()
  vi.stubGlobal('fetch', async (url: string) =>
    Response.json(
      url.endsWith('/movements')
        ? [movement]
        : [
            {
              id: 'receipt-a',
              name: 'fatura.pdf',
              mime: 'application/pdf',
              size: 8,
            },
          ],
    ),
  )
  render(
    <MovementHistory {...props} canEdit={false} canManageReceipts={false} />,
  )
  await user.click(
    await screen.findByRole('button', { name: 'Comprovativos de Material' }),
  )
  expect(
    await screen.findByRole('link', { name: 'fatura.pdf' }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Anexar comprovativo' }),
  ).not.toBeInTheDocument()
})

it('reports upload failures without claiming success', async () => {
  const user = userEvent.setup()
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/movements')) return Response.json([movement])
    if (init?.method === 'POST')
      return Response.json({ error: 'offline' }, { status: 503 })
    return Response.json([])
  })
  render(<MovementHistory {...props} canEdit canManageReceipts />)
  await user.click(
    await screen.findByRole('button', { name: 'Comprovativos de Material' }),
  )
  await user.upload(
    screen.getByLabelText('Comprovativo'),
    new File(['%PDF-1.7'], 'fatura.pdf', { type: 'application/pdf' }),
  )
  await user.click(screen.getByRole('button', { name: 'Anexar comprovativo' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não foi possível anexar o comprovativo.',
  )
  expect(
    screen.queryByRole('link', { name: 'fatura.pdf' }),
  ).not.toBeInTheDocument()
})
