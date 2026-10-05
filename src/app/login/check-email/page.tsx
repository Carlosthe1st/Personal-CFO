import Link from 'next/link'
import { AuthBrand } from '../../../components/auth-brand'

export default function CheckEmailPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <AuthBrand />
        <span className="auth-eyebrow">QUASE LÁ</span>
        <h1>Verifica o teu email</h1>
        <p>Enviámos um link de acesso. Abre o email mais recente e segue a ligação para entrar.</p>
        <Link className="auth-secondary-link" href="/login">Usar outro email</Link>
      </div>
    </main>
  )
}
