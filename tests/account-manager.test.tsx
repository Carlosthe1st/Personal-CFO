// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { AccountManager } from '../src/components/account-manager'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('offers PT and BR institutions and saves bank metadata in EUR-only account', async () => {
  const user = userEvent.setup()
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    expect(JSON.parse(init.body as string)).toMatchObject({
      kind: 'bank', bankCountry: 'BR', bankName: 'Banco do Brasil',
    })
    return Response.json({ id: 'bank-a' }, { status: 201 })
  })
  vi.stubGlobal('fetch', fetchMock)
  const onSaved = vi.fn()
  render(<AccountManager organizationId="org-a" accounts={[]} onSaved={onSaved} />)
  await user.click(screen.getByText('Gerir contas e categorias'))
  await user.type(screen.getByLabelText('Código da conta'), 'BANK_BR')
  await user.type(screen.getByLabelText('Nome da conta ou categoria'), 'Conta BR')
  await user.selectOptions(screen.getByLabelText('Classificação'), 'bank')
  await user.selectOptions(screen.getByLabelText('País do banco'), 'BR')
  await user.selectOptions(screen.getByLabelText('Banco de origem'), 'Banco do Brasil')
  await user.click(screen.getByRole('button', { name: 'Criar conta ou categoria' }))
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(onSaved).toHaveBeenCalledOnce()
})
