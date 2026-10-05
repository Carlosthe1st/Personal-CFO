// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ConfirmPage from '../src/app/auth/confirm/page'

afterEach(() => {
  cleanup()
  document.head.querySelector('#test-app-styles')?.remove()
})

it('renders the confirmation action as a visible button, not plain text', async () => {
  const styles = document.createElement('style')
  styles.id = 'test-app-styles'
  styles.textContent =
    'button{background:transparent;border:0;padding:0}' +
    readFileSync(resolve('src/app/globals.css'), 'utf8').replace(
      "@import 'tailwindcss';",
      '',
    )
  document.head.append(styles)
  render(await ConfirmPage({ searchParams: Promise.resolve({ c: 'test' }) }))

  const button = screen.getByRole('button', { name: 'Entrar no Personal CFO' })
  const appearance = getComputedStyle(button)
  expect(appearance.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(appearance.borderTopWidth).not.toBe('0px')
  expect(appearance.paddingTop).not.toBe('0px')
})
