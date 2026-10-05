// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { ReportPanel } from '../src/components/report-panel'

afterEach(cleanup)

it('offers CSV and PDF downloads for the selected period and account', async () => {
  const user = userEvent.setup()
  render(
    <ReportPanel
      organizationId="org-a"
      accounts={[{ id: 'account-a', name: 'Banco' }]}
    />,
  )
  await user.click(screen.getByText('Relatórios financeiros e razão'))
  await user.clear(screen.getByLabelText('Relatório desde'))
  await user.type(screen.getByLabelText('Relatório desde'), '2026-01-01')
  await user.clear(screen.getByLabelText('Relatório até'))
  await user.type(screen.getByLabelText('Relatório até'), '2026-12-31')
  await user.selectOptions(screen.getByLabelText('Conta no razão'), 'account-a')
  expect(screen.getByRole('link', { name: 'Descarregar CSV' })).toHaveAttribute(
    'href',
    '/api/organizations/org-a/reports/export?from=2026-01-01&to=2026-12-31&accountId=account-a&format=csv',
  )
  expect(screen.getByRole('link', { name: 'Descarregar PDF' })).toHaveAttribute(
    'href',
    '/api/organizations/org-a/reports/export?from=2026-01-01&to=2026-12-31&accountId=account-a&format=pdf',
  )
})

it('hides downloads when the period is inverted', async () => {
  const user = userEvent.setup()
  render(<ReportPanel organizationId="org-a" accounts={[]} />)
  await user.click(screen.getByText('Relatórios financeiros e razão'))
  await user.clear(screen.getByLabelText('Relatório desde'))
  await user.type(screen.getByLabelText('Relatório desde'), '2026-12-31')
  await user.clear(screen.getByLabelText('Relatório até'))
  await user.type(screen.getByLabelText('Relatório até'), '2026-01-01')
  expect(
    screen.queryByRole('link', { name: 'Descarregar CSV' }),
  ).not.toBeInTheDocument()
})
