// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { CategoryCreator } from '../src/components/category-creator'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('creates a category and returns its id without changing the surrounding form', async () => {
  const user = userEvent.setup()
  const onCreated = vi.fn()
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    expect(JSON.parse(init.body as string)).toMatchObject({ name: 'Transportes', kind: 'expense' })
    return Response.json({ id: 'new-category' }, { status: 201 })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<CategoryCreator organizationId="org-a" kind="expense" onCreated={onCreated} />)
  await user.click(screen.getByRole('button', { name: 'Criar categoria' }))
  await user.type(screen.getByLabelText('Nome da nova categoria'), 'Transportes')
  await user.click(screen.getByRole('button', { name: 'Guardar categoria' }))
  expect(onCreated).toHaveBeenCalledWith('new-category')
  expect(fetchMock).toHaveBeenCalledOnce()
})
