import { AppShell } from '@/components/app-shell'
import Link from 'next/link'

export default function Home() {
  return (
    <>
      <AppShell />
      <p className="accounting-entry">
        <Link href="/contabilidade" prefetch={false}>
          Contabilidade autenticada (desenvolvimento)
        </Link>
      </p>
    </>
  )
}
