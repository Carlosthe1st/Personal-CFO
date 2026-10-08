# CondoFlow Visual System for Personal CFO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every production-facing Personal CFO screen follow the approved CondoFlow visual language, with horizontal desktop navigation and an accessible compact mobile menu.

**Architecture:** Keep the existing React views, authorization checks, organization state, and API calls. Change the shared CSS tokens, root font, authentication presentation, and the `AccountingWorkspace` shell; restyle existing view primitives without introducing a component library or copying CondoFlow HTML. Test through rendered DOM and user actions, then check the actual browser at desktop and mobile widths.

**Tech Stack:** Next.js 16.3.6 App Router, React 19.3.0, TypeScript, CSS, Lucide, Vitest 5, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-08-condoflow-personal-cfo-redesign-design.md`

## Global Constraints

- Preserve the name Personal CFO, Portuguese product copy, live financial data, login flow, roles, and organization isolation.
- Use `#F7F6F4` background, `#17171A` text, `#1B3A6B` primary, `#EDF1F7` subtle blue; Geist text and Geist Mono only for small metadata.
- Desktop: one horizontal navigation for the seven existing views; mobile: authorized views in an operable menu with Escape and focus restoration.
- At 390 px, the four overview metrics stay in a two-column, two-row grid; use restrained distinct color accents without altering real values.
- `/` keeps redirecting through `/contabilidade`; unauthenticated visitors continue to `/login`.
- Do not add a UI library, change financial APIs or schema, invent production records, or copy CondoFlow marketing content.
- Before editing Next.js files, read the relevant local `node_modules/next/dist/docs/` guidance as instructed by `AGENTS.md`.
- Use the TDD red/green cycle and Ponytail's simplest-working-solution check for each implementation task. Code comments, if needed, are brief and in English.

## Review Focus

- A reader with no `assistant` or `management` permission sees neither destination in desktop or mobile navigation (Task 2 and 3 tests).
- Changing between two organizations returns to Overview and reloads the selected organization's data (Task 2 test).
- A long organization name and seven destinations fit at 390 px without hidden horizontal navigation or clipped controls (Task 3 browser check).
- Opening the compact menu traps focus; Escape closes it and restores focus to its trigger (Task 3 tests).
- Login errors, unconfigured email service, confirmation and check-email screens retain readable, actionable controls (Task 1 tests and browser check).

---

## File map and test seams

- `src/app/layout.tsx`: load Geist and Geist Mono using the installed Next.js `next/font/google` API.
- `src/app/globals.css`: shared tokens and styles; replace active green/sidebar rules instead of stacking final overrides indefinitely.
- `src/components/auth-brand.tsx` and the three existing auth routes: shared brand and authentication presentation only; preserve form actions and redirects.
- `src/components/accounting-workspace.tsx`: move organization picker and authorized navigation into the top-level header; retain the `View` union, `navigate(View)`, data loading and permissions.
- `tests/auth-confirm-ui.test.tsx` and auth route tests: observe user-visible DOM and computed styles, never auth internals.
- `tests/accounting-workspace.test.tsx`: observe public banner/navigation, selection, menu, keyboard and financial content. Do not test private React state.

The user-approved test seams are the rendered UI and actual browser, not internal state or implementation-specific CSS classes. Existing test commands are `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build`.

### Task 1: Shared visual tokens, fonts, and authentication

**Files:**

- Modify: `src/app/layout.tsx`, `src/app/globals.css`, `src/components/auth-brand.tsx`
- Modify only if markup needs a shared class: `src/app/login/page.tsx`, `src/app/login/check-email/page.tsx`, `src/app/auth/confirm/page.tsx`
- Test: `tests/auth-confirm-ui.test.tsx` and existing auth tests

**Interfaces:** Produces CSS custom properties `--bg`, `--ink`, `--primary`, `--primary-soft`, `--line`, `--muted`, `--font-geist`, `--font-geist-mono`; later tasks consume these in the same CSS file. Auth form actions and route signatures stay unchanged.

- [ ] **Step 1: Read local Next.js guidance.** Read `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md` and `11-css.md`; verify `Geist`/`Geist_Mono` import and root-layout variable syntax in this installed version.
- [ ] **Step 2: Write the failing auth visual test.** In `tests/auth-confirm-ui.test.tsx`, keep its stylesheet injection and add `expect(getComputedStyle(button).backgroundColor).toBe('rgb(27, 58, 107)')` and `expect(getComputedStyle(screen.getByRole('main')).backgroundColor).toBe('rgb(247, 246, 244)')`. Render `CheckEmailPage` in a second test and assert `screen.getByRole('link', { name: 'Usar outro email' })` points to `/login`. Keep existing login/auth flow tests unchanged.
- [ ] **Step 3: Run RED.** `npx vitest run tests/auth-confirm-ui.test.tsx`; expect the color assertions to fail on the old green styling.
- [ ] **Step 4: Implement the minimum.** In `layout.tsx`, use `Geist({ subsets: ['latin'], variable: '--font-geist' })` and `Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })`, applying both classes to `<body>`. In `globals.css`, define the exact tokens above, set the base font to `var(--font-geist), Arial, sans-serif`, and give `.auth-page`, `.auth-card`, `.auth-card button`, `.auth-error`, fields and links the approved palette, focus ring and spacing. Use `AuthBrand` for a consistent wordmark without changing any sign-in action.
- [ ] **Step 5: Run GREEN and regression.** Run focused auth tests, `npm run typecheck`, and `npm run lint`. Expect all to pass; fix only regressions caused here.
- [ ] **Step 6: Commit.** `git add src/app/layout.tsx src/app/globals.css src/components/auth-brand.tsx src/app/login src/app/auth/confirm tests && git commit -m "style: establish Personal CFO CondoFlow visual foundation"` (stage only files actually changed).

### Task 2: One horizontal desktop shell

**Files:**

- Modify: `src/components/accounting-workspace.tsx`, `src/app/globals.css`
- Test: `tests/accounting-workspace.test.tsx`

**Interfaces:** Consumes Task 1 tokens. Keeps `type View` and `navigate(next: View): void`. Produces a top-level `<header className="workspace-header">` with desktop `<nav aria-label="Navegação principal">`, a single `select[aria-label="Organização"]`, account sign-out, and a separate context row. The seven view IDs and role filters remain unchanged.

- [ ] **Step 1: Write failing shell tests.** Render `AccountingWorkspace` with mocked `fetch`. Assert `screen.getByRole('banner')` contains the primary navigation and organization select; assert no `<aside>` or `role="complementary"`; assert the reader cannot see `Falar com o CFO` or `Administração`. Add a second organization and select it with `user.selectOptions(screen.getByRole('combobox', { name: 'Organização' }), 'org-b')`; assert Overview is current and the `/api/organizations/org-b/accounts` request occurs.
- [ ] **Step 2: Run RED.** `npx vitest run tests/accounting-workspace.test.tsx`; expect the banner/no-aside expectations to fail against the old sidebar.
- [ ] **Step 3: Implement the shell.** Move the existing brand, organization selector, filtered navigation and sign-out out of `<aside>` into a `<header>` sibling preceding `<main>`. Map `navigation.filter(...)` to buttons with `aria-current="page"` for the current view, preserving the existing predicate `(id !== 'management' || canManage || !organizationId) && (id !== 'assistant' || canWrite)`. Keep the existing organization `onChange` body (`setOrganizationId(event.target.value); navigate('overview')`). Put current organization and view in a compact context row. Replace `.accounting-frame`/`.sidebar` layout rules with full-width column, sticky pale header, max-width content and blue active pill; do not touch data hooks or view bodies.
- [ ] **Step 4: Run GREEN.** `npx vitest run tests/accounting-workspace.test.tsx`; expect the new and existing behavior tests to pass. Run `npm run typecheck` and `npm run lint`.
- [ ] **Step 5: Commit.** `git add src/components/accounting-workspace.tsx src/app/globals.css tests/accounting-workspace.test.tsx && git commit -m "feat: move workspace navigation into horizontal header"`.

### Task 3: Compact accessible navigation

**Files:**

- Modify: `src/components/accounting-workspace.tsx`, `src/app/globals.css`
- Test: `tests/accounting-workspace.test.tsx`

**Interfaces:** Consumes Task 2's header and `navigation` list. Reuses `mobileMenu: boolean`, `menuToggleRef`, and focus-management effect. Produces a compact `<div role="dialog" aria-label="Menu principal">` only while open, with the same authorized views as desktop.

- [ ] **Step 1: Write failing mobile interaction tests.** Assert the menu trigger is inside the banner and has `aria-expanded="false"`; clicking opens a `dialog` containing the authorized `Navegação principal` and sets `aria-expanded="true"`; clicking a view closes it and updates the current view. Retain and extend the existing Escape/focus test by pressing `Tab` and `Shift+Tab` at the menu ends and asserting focus remains inside the dialog. Assert reader menu has no forbidden views.
- [ ] **Step 2: Run RED.** `npx vitest run tests/accounting-workspace.test.tsx`; expect the banner-contained trigger or dialog tests to fail before implementation.
- [ ] **Step 3: Implement the compact menu.** Replace `sidebarRef` with `mobileMenuRef`; render the dialog near the header trigger, not as a full-height sidebar. Reuse `navigate(id)` so selection closes it; preserve the effect's Escape, focus trap, body-scroll restoration and trigger-focus restoration. Use a breakpoint at or above the width where seven items cannot fit (start with `@media (max-width: 1180px)`), hide desktop nav, expose menu trigger, allow the organization selector to truncate, and keep the menu within the viewport. Use real button labels rather than a horizontally scrolling nav.
- [ ] **Step 4: Run GREEN and inspect sizes.** Run the focused tests, then inspect at 1440 px and 390 px in browser. At 390 px confirm no page-level horizontal overflow, long organization name stays usable, all authorized views are reachable, and Escape restores trigger focus. Adjust only proven layout defects.
- [ ] **Step 5: Commit.** `git add src/components/accounting-workspace.tsx src/app/globals.css tests/accounting-workspace.test.tsx && git commit -m "feat: add accessible compact workspace menu"`.

### Task 4: Unify every active financial view and complete verification

**Files:**

- Modify: `src/app/globals.css`
- Modify only when a reusable semantic wrapper is necessary: `src/components/accounting-workspace.tsx` and active view/panel components imported by it
- Test: `tests/accounting-workspace.test.tsx`, `tests/auth-confirm-ui.test.tsx`, existing budget/movement/report/management/chat tests

**Interfaces:** Consumes Task 1 tokens and Tasks 2–3 shell. Does not alter component props, financial calculations, API request paths, form payloads or permissions. Produces one consistent card, table, field, button, badge and empty/error-state presentation across all active views.

- [ ] **Step 1: Write failing visual-contract tests at public seams.** Reuse the stylesheet injection from `auth-confirm-ui.test.tsx` in `accounting-workspace.test.tsx`, render `AccountingWorkspace` with mocked `fetch`, and assert `getComputedStyle(screen.getByRole('main')).backgroundColor` is `rgb(247, 246, 244)`; the old content surface must fail this assertion. Keep the existing failed-fetch test, which already asserts `role="alert"` and the `Tentar novamente` button, as the behavior baseline. Browser acceptance must check four overview metrics in a 2×2 arrangement at 390 px.
- [ ] **Step 2: Run RED.** `npx vitest run tests/accounting-workspace.test.tsx tests/auth-confirm-ui.test.tsx`; expect the visual-contract assertion to fail on remaining green styles.
- [ ] **Step 3: Implement shared view styling.** Replace the active green declarations for `.accounting-content` and its child cards, charts, metric blocks, tables, forms, badges and task panels with token-based styles. Preserve semantic danger/success colors, high-contrast focus and readable numeric alignment. Avoid adding a one-off override for every component; group selectors by existing semantic class. Remove old `.sidebar`, `.side-nav`, obsolete mobile sidebar and unused active-view rules once their replacements are verified. Leave dormant demonstration styles alone unless they conflict with active pages.
- [ ] **Step 4: Run GREEN and full checks.** Run focused tests, `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build`; fix caused failures, and explicitly report any unrelated baseline failure. Run `impeccable detect --json` if the installed CLI is available; otherwise use its prescribed manual visual checklist.
- [ ] **Step 5: Browser acceptance.** Compare `/login`, `/login/check-email`, `/auth/confirm` and each accessible `/contabilidade` view at 1440 px and 390 px against the approved CondoFlow App reference. Check loading, empty, error, permissions, keyboard focus, overflow, tables and forms. Correct material defects and confirm in a second pass. Do not post financial records to production for this check.
- [ ] **Step 6: Commit.** Stage only changed implementation and tests, then `git commit -m "style: unify Personal CFO financial views"`. Request the selected review gate, address findings, and re-run the relevant checks.
- [ ] **Step 7: Publish only after approval and green checks.** Deploy the verified commit through the existing Vercel project; then verify HTTPS, unauthenticated `/` → `/contabilidade` → `/login`, and an authenticated workspace load. If deployment or access requires new secrets or account intervention, stop and report the exact blocker rather than claiming success.
