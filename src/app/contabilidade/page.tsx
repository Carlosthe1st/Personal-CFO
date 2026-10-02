import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth, authConfigured } from '../../auth'
import { listOrganizations } from '../../server/organizations'
import { AccountingWorkspace } from '../../components/accounting-workspace'

export const dynamic = 'force-dynamic'
export default async function AccountingPage() {
  if (!authConfigured())
    return (
      <main className="accounting-workspace">
        <h1>Contabilidade indisponível</h1>
        <p>
          Esta área ainda não está configurada. A demonstração continua
          disponível.
        </p>
        <Link href="/">Voltar à demonstração</Link>
      </main>
    )
  const session = await auth()
  if (!session?.user?.id)
    redirect('/api/auth/signin?callbackUrl=/contabilidade')
  let organizations: Awaited<ReturnType<typeof listOrganizations>> | null = null
  try {
    organizations = await listOrganizations(session.user.id)
  } catch {}
  if (!organizations)
    return (
      <main className="accounting-workspace">
        <h1>Contabilidade indisponível</h1>
        <p>Não foi possível consultar os dados. Tenta novamente mais tarde.</p>
        <Link href="/">Voltar à demonstração</Link>
      </main>
    )
  return <AccountingWorkspace organizations={organizations} />
}
