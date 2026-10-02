import type { NextRequest } from 'next/server'
import { authenticated, json, requestBody } from '../../../server/http'
import {
  createOrganization,
  listOrganizations,
} from '../../../server/organizations'
import { InvalidInputError } from '../../../server/authorization'

export async function GET(request: NextRequest) {
  return authenticated(request, async (userId) =>
    json(await listOrganizations(userId)),
  )
}
export async function POST(request: NextRequest) {
  return authenticated(request, async (userId) => {
    const body = await requestBody(request)
    if (typeof body.name !== 'string') throw new InvalidInputError()
    return json(await createOrganization(userId, body.name), 201)
  })
}
