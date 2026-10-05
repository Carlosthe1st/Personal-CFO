# Verbas, recorrências e previsão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acompanhar verbas por projeto/ministério, propor movimentos recorrentes para confirmação e projetar caixa por 90 dias sem lançamentos automáticos.

**Architecture:** `funds` classifica movimentos existentes sem criar outro saldo bancário. Alocações mensais por fundo são separadas do orçamento geral e auditadas. Regras recorrentes produzem ocorrências virtuais; confirmar uma ocorrência usa o mesmo serviço transacional de movimento. A previsão soma apenas caixa confirmado e ocorrências futuras não confirmadas.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle/PostgreSQL, Vitest; sem cron ou motor de IA.

**Spec:** `docs/superpowers/specs/2026-10-05-verbas-recorrencias-previsao-design.md`

## Global Constraints

- EUR em cêntimos inteiros, organizações isoladas, autorização no servidor, histórico de correções e idempotência.
- Fundos não criam contas bancárias, saldos contábeis nem alteram partidas dobradas.
- Recorrências nunca lançam automaticamente; editor+ confirma cada ocorrência.
- Dia mensal 29–31 cai no último dia de meses mais curtos; horizonte de previsão fixo em 90 dias.
- Ler as referências relevantes de Next.js em `node_modules/next/dist/docs/` antes de alterar código.
- TDD RED→GREEN, migrações aditivas, comentários mínimos em inglês.

## Review Focus

1. Identificador de fundo de outra organização no POST de movimento → 403/400 sem gravação.
2. Correção de movimento com mudança de fundo → realizado anterior sai e novo entra uma vez.
3. Duas confirmações simultâneas da mesma ocorrência → um movimento/lançamento.
4. Dia 31 em fevereiro e viragem de ano/DST Lisboa → data válida e previsível.
5. Falha na criação do movimento recorrente → ocorrência permanece não confirmada, sem parcialidade.

---

### Task 1: Fundos e classificação de movimentos

**Files:**
- Modify: `src/db/schema.ts`, generated `drizzle/*` — `funds` e `movements.fundId` opcional.
- Create: `src/server/funds.ts` — CRUD lógico e isolamento.
- Create: `src/app/api/organizations/[organizationId]/funds/route.ts` and `.../funds/[fundId]/route.ts` — API.
- Modify: `src/server/movements.ts`, movement routes, `src/components/accounting-workspace.tsx`, `src/components/movement-history.tsx` — seleção e correção do fundo.
- Test: `tests/funds.test.ts`, `tests/movement-funds.test.tsx`.

**Interfaces:**
- Produces: `listFunds(organizationId:string, actorId:string)`, `createFund({organizationId,actorId,name})`, `updateFund({organizationId,actorId,fundId,name,active})`; `MovementInput` and replacement gain `fundId?: string | null`.

- [ ] **Step 1: Write failing tests.** Criar dois fundos, classificar despesa no primeiro, corrigir para segundo, verificar que os lançamentos continuam equilibrados e que outro org não pode usar nenhum deles:

```ts
const fund = await createFund({ organizationId: org.id, actorId: user.id, name: 'Missões' })
await expect(createMovement({ ...movementInput, fundId: fund.id })).resolves.toHaveProperty('id')
await expect(createMovement({ ...otherOrgInput, fundId: fund.id })).rejects.toMatchObject({ status: 403 })
```

- [ ] **Step 2: Run RED.** `DATABASE_URL_TEST='postgres://postgres:postgres@127.0.0.1:54339/personal_cfo_accounts_test' npx vitest run tests/funds.test.ts tests/movement-funds.test.tsx --configLoader runner`; expected: missing fields/functions or failed assertions, not skips.
- [ ] **Step 3: Implement minimal model.** `funds` holds UUID, organization FK, name, active, version with unique `(organization_id,id)` and case-insensitive org/name uniqueness. `movements.fundId` nullable FK `(organization_id,fund_id)`; null means “Sem fundo”. `createMovementInTransaction` validates active fund of the same org, then writes id; correction replacement carries its own fund id while original stays immutable. Transfer-type movements have no fund to avoid counting an internal bank transfer as income/expense. Generate migration via `npm run db:generate`.

```ts
type FundInput = { organizationId: string; actorId: string; name: string }
type MovementInput = { organizationId: string; actorId: string; type: MovementType; date: string; description: string; amountCents: number; financialAccountId: string; counterAccountId: string; idempotencyKey: string; fundId?: string | null }
if (input.fundId) {
  const [fund] = await tx.select().from(funds).where(and(eq(funds.id, input.fundId), eq(funds.organizationId, input.organizationId), eq(funds.active, true)))
  if (!fund) throw new ForbiddenError()
}
```
- [ ] **Step 4: GREEN and UI.** Run tests; add fund selector to movement creation/correction, default “Sem fundo”; management panel lists create/rename/archive with owner/admin controls. Test selection retained while editing other fields and reader cannot mutate.
- [ ] **Step 5: Commit.** `git add src/db/schema.ts drizzle src/server/funds.ts src/server/movements.ts src/app/api/organizations src/components/accounting-workspace.tsx src/components/movement-history.tsx tests/funds.test.ts tests/movement-funds.test.tsx && git commit -m 'Classify movements by organization fund'`.

### Task 2: Alocações manuais e análise por fundo

**Files:**
- Modify: `src/db/schema.ts`, generated `drizzle/*` — `fund_allocations` e eventos.
- Create: `src/server/fund-budgets.ts` — revisão, transferência, leitura de realizado.
- Create: `src/app/api/organizations/[organizationId]/funds/budgets/route.ts` — GET/POST.
- Modify: `src/server/reports.ts`, `src/server/report-export.ts`, `src/components/budget-panel.tsx`, `src/components/report-panel.tsx` — filtro e resumo por fundo.
- Test: `tests/fund-budgets.test.ts`, `tests/fund-report.test.tsx`.

**Interfaces:**
- Consumes: Task 1 `funds`, `movements.fundId`; existing `budgets` remains intact.
- Produces: `getFundBudget(organizationId,actorId,year)` and `changeFundBudget({organizationId,actorId,year,operationId,reason,from?:{fundId,month},to:{fundId,month},amountCents,mode:'revise'|'transfer'})`. Extends `getReports(organizationId,actorId,from,to,accountId?,fundId?)` and `exportReport({...input,fundId?})` without changing existing calls.
- Local `writeAllocation(tx, address:{fundId:string;month:number}, plannedCents:number)` upserts within the same transaction after locking fund rows.

- [ ] **Step 1: Write failing tests.** Verba inicial 70 000 € no orçamento geral, 10 000 € para Missões e 5 000 € para Jovens; transferir 1 000 € manualmente e verificar soma inalterada, eventos antes/depois e realizado apenas do fundo escolhido. Corrigir movimento para outro fundo e verificar realocação do realizado. Enviar `operationId` duas vezes e confirmar um evento. Fonte insuficiente devolve 400.
- [ ] **Step 2: Run RED.** `DATABASE_URL_TEST='postgres://postgres:postgres@127.0.0.1:54339/personal_cfo_accounts_test' npx vitest run tests/fund-budgets.test.ts tests/fund-report.test.tsx --configLoader runner`; expected: API/cálculos ausentes.
- [ ] **Step 3: Implement change transaction.** `fund_allocations` usa `(organization_id,fund_id,year,month)` único; `fund_allocation_events` guarda operação única, hash do pedido, autor, motivo, origem/destino e snapshots antes/depois. Validar `month ∈ [1,12]`, ano e cêntimos seguros; bloquear células afetadas; transferência exige `source >= amount` e preserva total. Revisão pode aumentar verba; comparar soma das alocações com verba anual geral apenas como aviso. Realizado vem de movimentos ativos confirmados por data/fundo; corrigidos/removidos não entram duas vezes.

```ts
if (!Number.isSafeInteger(amountCents) || amountCents < 0 || month < 1 || month > 12) throw new InvalidInputError()
if (mode === 'transfer') {
  if (!from || source.plannedCents < amountCents) throw new InvalidInputError()
  await writeAllocation(tx, from, source.plannedCents - amountCents)
  await writeAllocation(tx, to, destination.plannedCents + amountCents)
}
await tx.insert(fundAllocationEvents).values({ organizationId, actorId, operationId, requestHash, reason, before, after })
```
- [ ] **Step 4: GREEN and UI.** Mostrar tabela mensal por fundo (planeado/realizado/disponível) no painel de orçamento, revisão e transferência manual com motivo. Relatório e CSV/PDF aceitam filtro `fundId`; backend valida fundo da organização. Testar relatório sem fundo e consolidado.
- [ ] **Step 5: Commit.** `git add src/db/schema.ts drizzle src/server/fund-budgets.ts src/server/reports.ts src/server/report-export.ts src/app/api/organizations src/components/budget-panel.tsx src/components/report-panel.tsx tests/fund-budgets.test.ts tests/fund-report.test.tsx && git commit -m 'Add fund allocations and fund reporting'`.

### Task 3: Regras recorrentes com confirmação explícita

**Files:**
- Modify: `src/db/schema.ts`, generated `drizzle/*` — regras e ocorrências resolvidas.
- Create: `src/server/recurrences.ts` — datas, regras, propostas, confirmação/ignorar.
- Create: `src/app/api/organizations/[organizationId]/recurrences/route.ts` and `.../recurrences/[ruleId]/occurrences/[date]/route.ts`.
- Modify: `src/server/movements.ts` — expor helper transacional interno para confirmação atómica.
- Create: `src/components/recurrence-panel.tsx` — configurar e confirmar.
- Test: `tests/recurrences.test.ts`, `tests/recurrence-panel.test.tsx`.

**Interfaces:**
- Consumes: Task 1 `MovementInput.fundId`; produces `listDueOccurrences(organizationId,actorId,throughDate)`, `confirmOccurrence({organizationId,actorId,ruleId,dueDate})`, `skipOccurrence(...)`.
- Local helpers in `recurrences.ts`: `lockOccurrence(tx,ruleId,dueDate)` reads the unique resolution row with a lock; `ruleToMovement(rule,dueDate)` maps the stored template to `MovementInput` sans actor/idempotency; `resolveOccurrence(tx,ruleId,dueDate,actorId,movementId)` inserts the confirmed resolution; `createMovementInTransaction` is exported server-internally from `movements.ts`.

- [ ] **Step 1: Write failing tests.** Regra no dia 31: fevereiro de 2027 produz dia 28; a viragem março/outubro em Lisboa não desloca o dia civil; duas confirmações simultâneas com `Promise.all` criam exatamente um movimento e um diário equilibrado; repetição devolve o mesmo movimento; falha de movimento não deixa ocorrência confirmada. Outro org e conta/fundo arquivado são rejeitados.
- [ ] **Step 2: Run RED.** `DATABASE_URL_TEST='postgres://postgres:postgres@127.0.0.1:54339/personal_cfo_accounts_test' npx vitest run tests/recurrences.test.ts tests/recurrence-panel.test.tsx --configLoader runner`; expected: serviço/controles ausentes.
- [ ] **Step 3: Implement minimal recurrence.** `recurrence_rules` guarda org, tipo, contas, fundo opcional, cêntimos, frequência (`weekly|monthly`), `start_date`, `end_date`, `anchor_day`, ativo e versão. `recurrence_occurrences` guarda chave única `(rule_id,due_date)`, estado `confirmed|skipped|postponed`, `postponed_until` opcional, movimento associado e ator/instante. Gerar propostas em memória com datas UTC puras e função `min(anchorDay, daysInMonth)`, sem converter dia civil por timezone. Uma ocorrência adiada reaparece em `postponed_until` sem criar outra regra. Limitar geração a 366 dias/60 ocorrências por pedido. Confirmar dentro de uma transação com bloqueio na regra e helper de movimento; idempotency key `recurrence_${ruleId}_${dueDate}`. Alterações de regra aplicam-se só a datas futuras ainda não resolvidas.

```ts
const day = Math.min(rule.anchorDay, new Date(Date.UTC(year, month, 0)).getUTCDate())
const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
return getDb().transaction(async (tx) => {
  const existing = await lockOccurrence(tx, ruleId, dueDate)
  if (existing?.movementId) return { movementId: existing.movementId }
  const movement = await createMovementInTransaction(tx, { ...ruleToMovement(rule, dueDate), actorId, idempotencyKey: `recurrence_${ruleId}_${dueDate}` })
  await resolveOccurrence(tx, ruleId, dueDate, actorId, movement.id)
  return { movementId: movement.id }
})
```
- [ ] **Step 4: GREEN and UI.** Owner/admin cria/edita regra; editor+ vê propostas e confirma/ignora/adia com ação explícita. Mostrar data, valor e contas antes da confirmação; teste reader sem botão de confirmação. Nenhum cron.
- [ ] **Step 5: Commit.** `git add src/db/schema.ts drizzle src/server/recurrences.ts src/server/movements.ts src/app/api/organizations src/components/recurrence-panel.tsx tests/recurrences.test.ts tests/recurrence-panel.test.tsx && git commit -m 'Add confirmed recurring movement proposals'`.

### Task 4: Previsão de caixa e verificação final

**Files:**
- Create: `src/server/cash-forecast.ts` — série de 90 dias.
- Create: `src/app/api/organizations/[organizationId]/forecast/route.ts`.
- Create: `src/components/forecast-panel.tsx` — real versus projetado e pressupostos.
- Modify: `src/components/accounting-workspace.tsx` — colocar painel na visão geral/orçamento.
- Test: `tests/cash-forecast.test.ts`, `tests/forecast-panel.test.tsx`.

**Interfaces:**
- Consumes: Task 3 `listDueOccurrences` e saldo confirmado de contas `cash|bank` do diário até hoje.
- Produces: `getCashForecast(organizationId:string, actorId:string, today:string): Promise<{actualCents:string; minimumProjectedCents:string; points:{date:string; projectedCents:string}[]; assumptions:string[]}>`.

- [ ] **Step 1: Write failing tests.** Saldo confirmado 1 000 €, despesa futura de 100 €, receita de 50 €: projeção 950 €; confirmar despesa desloca 100 € para realizado sem duplicar na projeção. Movimento futuro já confirmado não entra no saldo de hoje. Reader da organização pode consultar; pessoa externa não.
- [ ] **Step 2: Run RED.** `DATABASE_URL_TEST='postgres://postgres:postgres@127.0.0.1:54339/personal_cfo_accounts_test' npx vitest run tests/cash-forecast.test.ts tests/forecast-panel.test.tsx --configLoader runner`; expected: rota/serviço/painel ausentes.
- [ ] **Step 3: Implement projection.** Consultar diário postado com `date <= today` para saldo de caixa/banco; enumerar ocorrências virtuais não resolvidas `today < date <= today+90`, ordenar por dia, somar com `BigInt`; expor mínimo e pressupostos claros. Erro de consulta não se transforma em zero. Renderizar série e aviso de saldo projetado negativo, sempre separado de saldo real.

```ts
let projected = BigInt(actualCents)
let minimum = projected
const futureOccurrences = await listDueOccurrences(organizationId, actorId, horizonDate)
const points: { date: string; projectedCents: string }[] = []
for (const occurrence of futureOccurrences) {
  projected += occurrence.type === 'income' ? BigInt(occurrence.amountCents) : -BigInt(occurrence.amountCents)
  if (projected < minimum) minimum = projected
  points.push({ date: occurrence.dueDate, projectedCents: projected.toString() })
}
return { actualCents: String(actualCents), minimumProjectedCents: minimum.toString(), points, assumptions: ['Movimentos recorrentes pendentes; não são lançamentos confirmados.'] }
```
- [ ] **Step 4: GREEN and full verification.** Executar testes acima, depois `npm run typecheck && npm run lint && npm run build` e suíte PostgreSQL inteira com `--configLoader runner`. Verificar correções, troca de organização, orçamento geral legado e chat. Aplicar cada migração aditiva em produção antes do deploy, verificar esquema/Drizzle, publicar apenas após testes e fazer smoke autenticado e anónimo.
- [ ] **Step 5: Commit.** `git add src/server/cash-forecast.ts src/app/api/organizations/'[organizationId]'/forecast/route.ts src/components/forecast-panel.tsx src/components/accounting-workspace.tsx tests/cash-forecast.test.ts tests/forecast-panel.test.tsx && git commit -m 'Show confirmed and projected cash separately'`.
