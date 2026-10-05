import { AuthBrand } from '../../../components/auth-brand'

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const { c } = await searchParams
  return (
    <main className="auth-page">
      <div className="auth-card">
        <AuthBrand />
        <span className="auth-eyebrow">ACESSO SEGURO</span>
        <h1>Confirma o acesso</h1>
        <p>
          Clica no botão para entrar no Personal CFO. Por segurança, cada link só
          pode ser usado uma vez.
        </p>
        <form method="post" action="/api/auth/confirm">
          <input type="hidden" name="c" value={c ?? ''} />
          <button type="submit">Entrar no Personal CFO</button>
        </form>
      </div>
    </main>
  )
}
