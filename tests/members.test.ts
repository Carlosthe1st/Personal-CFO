import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import {
  prepareDatabase,
  resetDatabase,
  closeDatabase,
  testSql,
} from './helpers/database'
import {
  createOrganization,
  listOrganizations,
} from '../src/server/organizations'
import { POST } from '../src/app/api/organizations/[organizationId]/members/route'

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'membership administration',
  () => {
    beforeAll(prepareDatabase)
    beforeEach(resetDatabase)
    afterAll(closeDatabase)
    it('lets the owner add an existing user and change role without granting ownership', async () => {
      const [owner] =
        await testSql`insert into users (email) values ('owner@example.test') returning id`
      const [member] =
        await testSql`insert into users (email) values ('member@example.test') returning id`
      const org = await createOrganization(owner.id, 'Members')
      await testSql`insert into sessions (session_token,user_id,expires) values ('member-test',${owner.id},now()+interval '1 hour')`
      const post = (email: string, role: string) =>
        POST(
          new NextRequest(
            `http://localhost/api/organizations/${org.id}/members`,
            {
              method: 'POST',
              headers: {
                host: 'localhost',
                'x-forwarded-proto': 'http',
                origin: 'http://localhost',
                cookie: 'authjs.session-token=member-test',
                'content-type': 'application/json',
              },
              body: JSON.stringify({ email, role }),
            },
          ),
          { params: Promise.resolve({ organizationId: org.id }) },
        )
      expect((await post(' MEMBER@EXAMPLE.TEST ', 'reader')).status).toBe(200)
      expect(await listOrganizations(member.id)).toEqual([
        { ...org, role: 'reader' },
      ])
      expect((await post('member@example.test', 'editor')).status).toBe(200)
      expect(await listOrganizations(member.id)).toEqual([
        { ...org, role: 'editor' },
      ])
      expect((await post('owner@example.test', 'reader')).status).toBe(403)
      expect((await post('member@example.test', 'owner')).status).toBe(400)
    })
    it('allows scoped admin changes but denies editors, readers and outsiders', async () => {
      const [owner] =
        await testSql`insert into users (email) values ('owner@example.test') returning id`
      const [target] =
        await testSql`insert into users (email) values ('target@example.test') returning id`
      const org = await createOrganization(owner.id, 'Members')
      for (const role of ['admin', 'editor', 'reader', 'outsider']) {
        const [actor] =
          await testSql`insert into users (email) values (${`${role}@example.test`}) returning id`
        if (role !== 'outsider')
          await testSql`insert into memberships (organization_id,user_id,role) values (${org.id},${actor.id},${role})`
        await testSql`insert into sessions (session_token,user_id,expires) values (${role},${actor.id},now()+interval '1 hour')`
        const response = await POST(
          new NextRequest(
            `http://localhost/api/organizations/${org.id}/members`,
            {
              method: 'POST',
              headers: {
                host: 'localhost',
                'x-forwarded-proto': 'http',
                origin: 'http://localhost',
                cookie: `authjs.session-token=${role}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                email: 'target@example.test',
                role: 'reader',
              }),
            },
          ),
          { params: Promise.resolve({ organizationId: org.id }) },
        )
        expect(response.status).toBe(role === 'admin' ? 200 : 403)
      }
      expect(await listOrganizations(target.id)).toEqual([
        { ...org, role: 'reader' },
      ])
    })
  },
)
