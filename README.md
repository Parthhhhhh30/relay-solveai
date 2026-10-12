# RELAY — Enterprise Operations Readiness Workbench

**Independent portfolio prototype for an application to SolveAI's early-career Operations generalist vacancy.** Not affiliated with SolveAI. All people, organisations, access, security evidence, controls and company actions are synthetic. This tool does not manage real permissions or establish any real compliance claim.

## Why this exists

Enterprise AI companies need someone who can move between access administration, customer security reviews and everyday company operations without losing ownership or inventing completion. Instead of adding another generic founder dashboard, RELAY demonstrates two *connected* workflows in working code:

**Joiner/leaver → access register → evidence snapshot freshness → reviewer approval → export eligibility.**

The business-work queue supports GTM events, finance follow-up, contracts, recruiting and office actions without pretending to send emails, pay invoices or sign documents.

## Run it locally

Requirements: **Node.js 24.x** (this project uses the built-in `node:sqlite` API). Local SQLite mode needs no credentials or npm installation. Hosted Postgres mode requires `npm install` and a database connection.

```bash
cd relay-solveai
node --version
npm run check
npm test
npm start
```

Open **http://localhost:3000**. A SQLite database is created at `data/relay.sqlite` on first run. Actions persist on the local machine. Use **Reset synthetic demo** to restore the starting state.

If port 3000 is occupied:

```bash
PORT=3333 npm start
```

The UI has no build pipeline. The hosted storage adapter uses `pg`; it is loaded only when `DATABASE_URL` is configured.

## Durable hosted storage and release status

The Vercel entry point is `api/index.js`. When `DATABASE_URL` is set, a versioned synthetic workspace snapshot lives in Postgres. Every API operation takes a row lock, restores the snapshot into request-scoped in-memory SQLite, applies the same business rules, and commits the updated snapshot before sending success. A record change, linked evidence invalidation and audit entry therefore persist together. Hosted mode never uses a local SQLite file as a fallback.

This is a bounded **single shared demo**, not a normalised enterprise Postgres schema. Requests serialize on one workspace row; snapshots are capped at 2 MB. Successful writes reaching storage are limited to 60 per minute across all visitors. These limits prevent unbounded growth but do not prevent a visitor from exhausting the shared allowance. Hosted reset requires a server-side `RELAY_RESET_TOKEN` via `X-Relay-Reset-Token` and has a five-minute cooldown; the public UI disables reset. Missing reset credentials disable that endpoint. Browser writes require JSON and reject foreign origins. These controls do not authenticate normal operators.

**Live synthetic demo:** [relay-solveai-parthhhh.vercel.app](https://relay-solveai-parthhhh.vercel.app/). Source: [Parthhhhhh30/relay-solveai](https://github.com/Parthhhhhh30/relay-solveai).

**Hosted integration verified on 2026-10-12.** The Vercel Hobby project `parthhhh/relay-solveai` uses a Neon `free_v3` database in London, with required TLS and pooled application connections. Migration ran twice without replacing existing state. All 28 native tests, real HTTP smoke tests and live Neon concurrency/rollback tests pass. Chromium exercised access lifecycle → stale evidence → revised reference → fresh evidence/answer approvals → approved-only CSV, offboarding and mobile task work against the production environment. The complete browser walkthrough also passes on the public production domain. Separate public production API tests verify matching controls, blocked approvals, draft invalidation, spreadsheet-safe exports and audit records. A new Vercel deployment returned an identical persisted workspace before promotion. Preview/generated deployment URLs retain Vercel protection; the production domain is public. No paid resource or real operational data is used. See [QA_REPORT.md](QA_REPORT.md) for exact checks and limitations.

Hosted release procedure:

1. Install dependencies with `npm install` and commit the generated lockfile. Verify `npm run check` and `npm test`.
2. Use `npx --yes vercel@latest whoami` and inspect the intended account/project. Explicitly link the intended `relay-solveai` project, then run `npx --yes vercel@latest project inspect --non-interactive` to confirm the target.
3. Connect a free hosted Postgres resource through the authenticated CLI, selecting a verified free plan. Accept third-party terms only with account-owner approval. Never assume a paid plan is authorised.
4. Pull development variables with `npx --yes vercel@latest env pull .env.local --yes`. Run `npm run migrate` against the intended database. The migration creates the workspace table and seeds only when missing; it preserves existing snapshots. Local SQLite data is not automatically uploaded.
5. Publish to the existing public `Parthhhhhh30/relay-solveai` repository, preserving its current branch history. The Vercel project is connected to that repository. Local HTTPS Git credentials are not configured on the authoring machine; authenticated GitHub connector commits were used and their source trees verified by Git fetch. Keep `.env*`, `data/`, `.vercel/` and credentials out of Git.
6. Stage with `npx --yes vercel@latest deploy --prod --skip-domain`. Verify desktop/mobile UI flows, source invalidation and durable writes using the staged URL; use `npx --yes vercel@latest curl` for protected deployments. Repeat reads through a new instance/redeployment against the same database. Promote the tested production deployment with `npx --yes vercel@latest promote <deployment-url>` and connect its GitHub repository for subsequent builds.

Use `DATABASE_URL_UNPOOLED` for migrations and the isolated live database test; keep `DATABASE_URL` pooled for the application. Load these server-only values through ignored `.env.local`, never shell command arguments or frontend code. The hosted operator reset token is a Vercel Secret; normal browser sessions cannot reset the shared demo.

For hosted mode locally, place the provider's TLS Postgres connection URL in `.env.local` as `DATABASE_URL`, run `npm install`, `npm run migrate`, then `npm start`. Use only synthetic data. A missing table, unsupported snapshot version or unavailable database fails closed; there is no fallback demo seed that could hide lost state.

## What actually works

### People & access

- Create a new joiner with name, date, work email, laptop type and mandatory systems.
- Record access grants, requiring an operator confirmation note.
- Assign a laptop with asset tag; cannot mark the joiner ready while required accounts or asset assignment are incomplete.
- Begin offboarding, place granted access into revocation-pending status, and require explicit recorded revocation and device return before closure.
- Changes to the source access register automatically **stale related AC-01 evidence snapshots**, making any previously approved customer answers ineligible for export until the source reference and reviews are refreshed.
- All lifecycle transitions and who/what was *recorded* appear in the audit trail. No real provisioning/revocation occurs.

### Customer assurance

- Create a customer security review with a due date.
- Import up to 500 CSV questions (quoted commas and embedded newlines supported).
- Map each question to a named security control and matching evidence document reference.
- Manually draft a response; reviewer approvals require matching, current, approved evidence.
- Changes to the evidence version, source register or expiry invalidate approval.
- Inspect an explicit **included vs blocked** response package and download an **approved-only CSV**. No AI-generated compliance claims.
- Approvals are recorded using typed names; **identity is not authenticated**. An evidence reference is not evidence content.

### Business operations

- Add and update owned work in GTM, finance, contracts, hiring, office and general operations.
- Track due dates, progress, evidence-of-completion notes, and overdue exceptions.
- Review the append-only-at-application-level audit log and export a CSV of recent recorded activity.

### Interface

- Desktop navigation, mobile navigation, responsive cards/tables, persistent empty states and feedback messages.
- Inline actions and accessible labelled form fields; HTML-escaped dynamic record content.
- The dashboard surfaces open checks, expired evidence, unapproved answers and overdue work.

## 3-minute demo

1. **Overview:** see missing joiner access and overdue evidence alongside a customer review with five questions.
2. **People & access → Ava Morgan:** try **Mark ready**. The backend refuses until GitHub and Linear are recorded as granted and the laptop receives an asset tag. Record the actions, then mark Ava ready.
3. **Customer assurance → Northstar Financial:** the previously approved access-management answer is now blocked because the underlying register changed.
4. **Evidence library → Access lifecycle register extract:** revise the document reference (synthetic), record the revised evidence owner's approval, and return to the questionnaire. Record a fresh security reviewer approval. The answer becomes eligible for export again.
5. **Customer assurance → Review package:** inspect approved versus blocked questions and export only approved, current answers.
6. **People & access → Noah Patel:** complete each revocation and record his device's return before closing offboarding.
7. **Business operations:** update the event, overdue finance item or NDA action with an owner note; see the audit log update.

## Technology & limitations

| Item | Reality |
|---|---|
| Server | Node.js HTTP handler; `pg` dependency in hosted mode |
| Persistence | Local SQLite; durable Neon Postgres snapshot adapter (live local and hosted verification passed) |
| Business logic | Deterministic validation and transactional state transitions |
| UI | Vanilla JavaScript, custom CSS, semantic HTML |
| Data | All synthetic, automatically seeded |
| Reviews and approvals | Typed acknowledgements for *demonstration*, not authenticated approvals |
| Compliance | No live controls, certification, questionnaire attestation or security claim is verified |
| Identity, CRM, HRIS, accounting | **No** real integrations |
| Security posture | Synthetic portfolio prototype; not production-certified or multi-tenant |

**Do not deploy this prototype with real employee data or real enterprise compliance information.** Normal operators have no authentication or authorisation. Hosted mode has a shared write limit and operator-only reset, but no tamper-resistant logs. If shared as a public demo, anyone who has access to that deployment could modify its synthetic records; hosted reset is reserved for a credentialed operator. A production implementation would need identity-aware RBAC, tenant isolation, authenticated review approvals, encrypted evidence storage, immutable audit capture, CSRF protections, threat modelling, and integration security.

Node's built-in SQLite API is still marked experimental on some Node releases. The hosted adapter preserves synthetic state in Postgres, but its single-row snapshot architecture is deliberately limited to a small demonstration. A company application would need a normalised datastore, migrations and authenticated operations.

## Verification

```bash
npm run check  # JS syntax
npm test       # native Node tests for domain, storage and in-process API rules
npm run test:http # real socket workflow smoke test
npx playwright install chromium
BASE_URL=http://127.0.0.1:3000 npm run test:browser
npm run test:postgres # direct DATABASE_URL and schema creation permission
BASE_URL=https://your-authorized-demo.vercel.app npm run test:production
```

The default storage tests use a Postgres test double. `npm run test:postgres` separately tests a real configured database in a temporary isolated schema, including a deferred constraint failure at COMMIT; it cleans up its schema and does not reset the demo workspace. In-process API tests use the real handler without opening sockets. Functional tests cover both lifecycle gating and source/evidence invalidation, preventing false assurance approvals, CSV questionnaire imports, reset behaviour and auditable business operations.

The browser script requires a freshly seeded synthetic workspace and changes its records. Point it only at an intended QA demo, not an existing shared workspace. It verifies denied and completed readiness/offboarding, stale approval gates, both fresh human reviews, CSV download, reload persistence, mobile navigation/overflow, mobile GTM task closure and Escape. Screenshots and downloaded CSV go into ignored `test-results/`. It does not establish WCAG conformance or verify human reviewer identity. Local test Postgres was provided by a Docker container; hosted tests also ran on Neon Free. `test:production` creates synthetic records in the intended public demo. For protected staging browser tests, the script accepts `VERCEL_AUTH_COOKIE_FILE` pointing to a private CLI response-header file under ignored `test-results/`; never commit or share that credential file.

## Suggested interviewer framing

> I built a small operational workbench around two jobs that can easily go wrong in an enterprise AI startup: getting people safely set up or offboarded, and preparing trustworthy answers for enterprise customer security reviews. The interesting part is the connection. If an access record changes, evidence based on that register becomes stale, and the app blocks outdated customer answers from being exported. I intentionally kept this a synthetic portfolio demo—it doesn't provision accounts or certify compliance. The aim was to show how I'd think through operational dependencies and build a reliable process, not to pretend I already knew SolveAI's internal systems.
