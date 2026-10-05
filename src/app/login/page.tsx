import { redirect } from 'next/navigation'
import { auth, authConfigured } from '../../auth'
import { emailSignIn } from './actions'
import { AuthBrand } from '../../components/auth-brand'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (authConfigured() && (await auth())?.user?.id) redirect('/contabilidade')
  const { error } = await searchParams
  return (
    <main className="auth-page">
      <div className="auth-card">
        <AuthBrand />
        <span className="auth-eyebrow">O TEU ESPAÇO FINANCEIRO</span>
        <h1>Entrar no Personal CFO</h1>
        <p>Um lugar claro para gerir as finanças da tua organização.</p>
        {error && <p role="alert" className="auth-error">Não foi possível entrar. Pede um novo link e tenta novamente.</p>}
        {authConfigured() ? (
          <form action={emailSignIn}>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" placeholder="nome@organizacao.pt" />
            <button type="submit">Receber link de acesso <span aria-hidden="true">→</span></button>
          </form>
        ) : <p role="alert" className="auth-error">O acesso por email está temporariamente indisponível.</p>}
        <small>Enviamos um link de acesso seguro para o teu email. Não precisas de palavra-passe.</small>
      </div>
    </main>
  )
}
