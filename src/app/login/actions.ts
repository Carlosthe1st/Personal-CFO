'use server'

import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import { signIn, signOut } from '../../auth'

export async function emailSignIn(formData: FormData) {
  try {
    await signIn('nodemailer', {
      email: formData.get('email'),
      redirectTo: '/contabilidade',
    })
  } catch (error) {
    if (error instanceof AuthError)
      redirect('/login?error=1')
    throw error
  }
}

export async function emailSignOut() {
  await signOut({ redirectTo: '/login' })
}
