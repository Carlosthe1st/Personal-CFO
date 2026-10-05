import { redirect } from 'next/navigation'
import { auth, authConfigured } from '../../auth'
import { listOrganizations } from '../../server/organizations'
import { AccountingWorkspace } from '../../components/accounting-workspace'

export const dynamic = 'force-dynamic'
export default async function AccountingPage() {
  if (!authConfigured())
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Contabilidade indisponível</h1>
          <p>
            Esta área ainda não está configurada. Tenta novamente mais tarde.
          </p>
        </div>
      </main>
    )
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  let organizations: Awaited<ReturnType<typeof listOrganizations>> | null = null
  try {
    organizations = await listOrganizations(session.user.id)
  } catch {}
  if (!organizations)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Contabilidade indisponível</h1>
          <p>
            Não foi possível consultar os dados. Tenta novamente mais tarde.
          </p>
        </div>
      </main>
    )
  return (
    <AccountingWorkspace
      organizations={organizations}
      receiptStorageConfigured={Boolean(
        process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
      )}
    />
  )
}
