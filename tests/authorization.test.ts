import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import {
  prepareDatabase,
  resetDatabase,
  closeDatabase,
  testSql,
} from './helpers/database'
import { requireMember } from '../src/server/authorization'
import {
  createOrganization,
  listOrganizations,
} from '../src/server/organizations'
import { NextRequest } from 'next/server'
import { GET } from '../src/app/api/organizations/route'
import { GET as getAccounts } from '../src/app/api/organizations/[organizationId]/accounts/route'
import { POST as authPost } from '../src/app/api/auth/[...nextauth]/route'

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'organization authorization',
  () => {
    beforeAll(prepareDatabase)
    beforeEach(resetDatabase)
    afterAll(closeDatabase)
    it('lets an owner create an isolated organization and denies another user', async () => {
      const [owner] =
        await testSql`insert into users (email) values ('owner@example.test') returning id`
      const [other] =
        await testSql`insert into users (email) values ('other@example.test') returning id`
      const organization = await createOrganization(owner.id, 'Atelier')
      await expect(
        requireMember(owner.id, organization.id, ['owner']),
      ).resolves.toBe('owner')
      expect(await listOrganizations(owner.id)).toEqual([
        { ...organization, role: 'owner' },
      ])
      expect(await listOrganizations(other.id)).toEqual([])
      await expect(
        requireMember(other.id, organization.id, ['reader']),
      ).rejects.toMatchObject({ status: 403 })
    })
    it('denies an anonymous request instead of returning organizations', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/organizations'),
      )
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        error: 'Autenticação necessária.',
      })
    })
    it('returns the same public denial for another organization and an unknown one', async () => {
      const [owner] =
        await testSql`insert into users (email) values ('owner@example.test') returning id`
      const [other] =
        await testSql`insert into users (email) values ('other@example.test') returning id`
      const org = await createOrganization(other.id, 'Private')
      await testSql`insert into sessions (session_token, user_id, expires) values ('test-session', ${owner.id}, now() + interval '1 hour')`
      const request = () =>
        new NextRequest('http://localhost/api/organizations/ignored/accounts', {
          headers: {
            host: 'localhost',
            'x-forwarded-proto': 'http',
            cookie: 'authjs.session-token=test-session',
          },
        })
      const responses = await Promise.all(
        [org.id, '00000000-0000-0000-0000-000000000000'].map((organizationId) =>
          getAccounts(request(), {
            params: Promise.resolve({ organizationId }),
          }),
        ),
      )
      for (const response of responses) {
        expect(response.status).toBe(403)
        expect(await response.json()).toEqual({ error: 'Acesso negado.' })
      }
    })
    it('prevents a reader from writing and rejects no identity', async () => {
      const [user] =
        await testSql`insert into users (email) values ('reader@example.test') returning id`
      const org = await createOrganization(user.id, 'Read only')
      await testSql`update memberships set role='reader' where organization_id=${org.id}`
      await expect(
        requireMember(user.id, org.id, ['editor']),
      ).rejects.toMatchObject({ status: 403 })
      await expect(requireMember('', org.id, ['reader'])).rejects.toMatchObject(
        { status: 401 },
      )
    })
    it.each(['EMAIL_SERVER', 'AUTH_SECRET', 'DATABASE_URL'])(
      'fails closed when %s is missing',
      async (name) => {
        const previous = process.env[name]
        delete process.env[name]
        try {
          expect(
            (await GET(new NextRequest('http://localhost/api/organizations')))
              .status,
          ).toBe(503)
        } finally {
          process.env[name] = previous
        }
      },
    )
    it('rejects an oversized sign-in body even without a Content-Length header', async () => {
      const response = await authPost(
        new NextRequest('http://localhost/api/auth/signin/nodemailer', {
          method: 'POST',
          body: `email=${'a'.repeat(5000)}`,
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        }),
      )
      expect(response.status).toBe(400)
    })
  },
)
