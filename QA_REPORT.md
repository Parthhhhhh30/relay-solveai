# RELAY verification and delivery status

Verified locally on 2026-10-12 with Node.js v24.21.0, npm 11.19.0, PostgreSQL 17 (Docker), Playwright 1.61.1 and Chromium 149. Existing source and prior changes were preserved.

## Passed

- Dependencies installed and package-lock.json generated. npm audit reports zero vulnerabilities, including development dependencies.
- `npm run check`: all seven application modules parse.
- `npm test`: **28 passed, 0 failed**. Domain, snapshot and in-process API tests retain all previous regressions for readiness/offboarding, correct control mapping, expiry, stale sources, human approvals, CSV, reset and persistence failure.
- `npm run test:http`: real HTTP socket workflow passes for joiner creation, denied readiness, grants/device records, source invalidation, revised evidence, both approvals, safe CSV, denied offboarding and closure.
- Migration ran twice against actual local PostgreSQL 17, preserving the existing workspace.
- `DATABASE_URL=<local QA database> npm run test:postgres`: live tests pass for separate pools, simultaneous grants with no lost updates, source invalidation, denied lifecycle rollback, callback rollback, an actual deferred unique-constraint failure at COMMIT, fresh connection durability and shared write limit. Tests create and drop an isolated temporary schema; they never reset the configured demo row.
- `BASE_URL=http://127.0.0.1:3001 npm run test:browser`: real Chromium interaction passes against the Postgres-backed app at 1440×1000 and 390×844. Verifies denied readiness, grants, asset assignment, activation, stale evidence/answer approval gates, revised source reference, fresh evidence-owner and security-reviewer approvals, approved-only CSV download, denied and completed offboarding, reload persistence, all six mobile navigation destinations, no document overflow, mobile GTM task creation/closure and Escape. No page errors observed.
- A second independent HTTP process on port 3002 sees exactly the same persisted workflow state, including completed offboarding and the mobile task.
- Screenshots captured and visually inspected at `test-results/desktop.png` and `test-results/mobile.png`; generated screenshots/CSV remain excluded from Git and deployment uploads. This is functional browser verification, not a full accessibility audit or cross-browser certification.

## Failure fixed

Browser testing reproduced a disabled answer approval button after revised source evidence received fresh owner approval. The answer correctly had `needs_reapproval`, but the UI allowed only `ready_for_review`. The button now permits both states; the unchanged backend still requires current approved matching evidence, nonempty answer and fresh typed reviewer. The browser walkthrough is the regression for this exact interaction. No automatic approvals or weakened source gates were introduced.

This completes a role-relevant people/access ↔ customer-assurance handoff. Finance, contracts, hiring and GTM remain the existing manual work register; no external action is performed.

## Publication and release gates

- Local Git initialized successfully. Target `https://github.com/Parthhhhhh30/relay-solveai` was inspected with `git ls-remote`; no existing refs were reported. No remote work was overwritten.
- Git HTTPS push was blocked by missing local credentials. Authenticated GitHub connector published all 28 reviewed files to `main` at [a456c85](https://github.com/Parthhhhhh30/relay-solveai/commit/a456c85d7e968efa037592f669feb19bbb5e6788). Its tree `ac072c9c77ace012e2f3c17355aec5e59e68a116` exactly matches local commit `7e1c1f4`; read-only Git fetch confirmed the remote contents. Local and connector commit histories differ; no local work was discarded. Subsequent documentation commits may advance the branch. CLI Git credentials remain unconfigured for future direct pushes.
- Vercel CLI 63.1.2 authentication succeeded as `parthudnoor3024-6746`. Team `parthhhh` reports the **Hobby** plan.
- Explicitly created/linked and inspected `parthhhh/relay-solveai` (Node 24.x), project ID `prj_9jd7wieWaHmeMz9YGsKVNEoJ4Z4v`.
- Vercel connector lacked access to this scope; the authenticated CLI works and was used instead.
- No existing hosted storage resources were found. CLI help lists Neon `free_v3` as **Free (Free)**. Attempted only that plan, named `relay-solveai-demo`, London region, optional Neon auth disabled.
- Provisioning stopped with `integration_terms_acceptance_required`. Account owner must review/accept at https://vercel.com/parthhhh/~/integrations/accept-terms/neon?source=cli. No database resource, paid plan or deployed application is claimed.
- Local `.env.local` contains CLI-provided credentials and is excluded; `.vercel/`, `data/`, node_modules and test-results are excluded. Local SQLite and the local Docker database were not uploaded. Only fictional seed/QA records were used.

## Remaining work requiring the account step

1. After the owner accepts Neon terms, retry the explicit free-plan installation; inspect the resulting plan/resource and intended project before pulling credentials into ignored `.env.local`.
2. Run the idempotent migration against that intended hosted database and the isolated live Postgres test. Configure operator reset credential through secret-safe environment input if reset is enabled; keep it out of source/browser code.
3. Stage production without assigning domains, then verify real desktop/mobile browser flows, exports and durable changes across requests, application instances and redeployment against the same database. Promote only the tested deployment.
4. Record the actual GitHub commit and production URL. Production HTTP/browser/storage checks are currently **not run**; there is no live URL.

## Architecture and limitations

Hosted state is a versioned JSONB snapshot in one locked Postgres row. Every API operation restores request-scoped SQLite and commits mutation plus invalidation plus audit before reporting success. Reads also serialize. Missing credentials, table, invalid snapshot or failed persistence fail closed; no ephemeral seed fallback is permitted. Local SQLite is never automatically uploaded.

The shared synthetic workspace caps snapshots at 2 MB and successful writes reaching storage at 60 per minute. Visitors can modify fictional records and exhaust that shared allowance. This is not per-user authentication or comprehensive abuse protection. Hosted reset requires an operator credential and five-minute cooldown; public UI reset is disabled. Typed operators/reviewers are unauthenticated, logs are not tamper resistant, and document references are not document contents. No real provisioning, revocation, notifications, certifications or compliance claims occur.
