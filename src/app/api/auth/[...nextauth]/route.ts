import { NextRequest } from 'next/server'
import { handlers, authConfigured } from '../../../../auth'
import { errorResponse, limitedBody } from '../../../../server/http'
import {
  consumeLoginAttempt,
  guardLoginRequest,
} from '../../../../server/login-rate-limit'

export async function GET(request: NextRequest) {
  if (!authConfigured()) return errorResponse(new Error())
  try {
    return await handlers.GET(request)
  } catch {
    return errorResponse(new Error())
  }
}
export async function POST(request: NextRequest) {
  if (!authConfigured()) return errorResponse(new Error())
  try {
    const body = await limitedBody(request, 4096)
    const limited = await guardLoginRequest(
      request,
      body,
      consumeLoginAttempt,
      process.env.AUTH_SECRET!,
    )
    if (limited) return limited
    return await handlers.POST(
      new NextRequest(request.url, {
        method: request.method,
        headers: request.headers,
        body,
      }),
    )
  } catch (error) {
    return errorResponse(error)
  }
}
