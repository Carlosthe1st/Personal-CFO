import { NextRequest } from 'next/server'
import { handlers, authConfigured } from '../../../../auth'
import { errorResponse, limitedBody } from '../../../../server/http'

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
    return await handlers.POST(
      new NextRequest(request.url, {
        method: request.method,
        headers: request.headers,
        body: await limitedBody(request, 4096),
      }),
    )
  } catch (error) {
    return errorResponse(error)
  }
}
