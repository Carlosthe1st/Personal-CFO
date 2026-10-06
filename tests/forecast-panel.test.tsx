// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { ForecastPanel } from '../src/components/forecast-panel'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('distinguishes actual cash from projected cash and explains assumptions', async () => {
  const user = userEvent.setup()
  vi.stubGlobal('fetch', async () =>
    Response.json({
      actualCents: '100000',
      minimumProjectedCents: '90000',
      points: [{ date: '2026-10-20', projectedCents: '90000' }],
      assumptions: ['Propostas ainda não confirmadas.'],
    }),
  )
  render(<ForecastPanel organizationId="org-a" />)
  await user.click(
    screen.getByRole('button', { name: 'Abrir previsão de caixa' }),
  )
  expect(await screen.findByText(/Saldo real.*1\s?000/)).toBeInTheDocument()
  expect(
    screen.getByText(/Propostas ainda não confirmadas/),
  ).toBeInTheDocument()
})
