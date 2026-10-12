# RELAY verification and delivery status

Verified locally and against hosted Neon/Vercel on 2026-10-12 with Node.js v24.21.0, npm 11.19.0, PostgreSQL 17 (Docker), Playwright 1.61.1 and Chromium 149. Existing source and prior changes were preserved.

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

## Hosted release

Live public URL: **https://relay-solveai-parthhhh.vercel.app/**. Project: `parthhhh/relay-solveai`, Node 24.x, Vercel Hobby. GitHub: https://github.com/Parthhhhhh30/relay-solveai.

- Account-owner Neon terms acceptance was confirmed by successful provisioning. Resource `relay-solveai-demo` (`store_JflDnljTiArQ0NAa`) reports **free_v3 / Free**, London (`lhr1`), no payment method required. No paid plan, upgrade, purchased domain, extra monitoring product or other paid resource was requested.
- Database URLs were pulled into ignored, mode-600 `.env.local`. Required TLS and pooled application URL were validated without printing credentials. Migrations and isolated live tests used `DATABASE_URL_UNPOOLED`. Migration was run twice, preserving existing state; live Neon concurrency, callback/COMMIT rollback, denied transitions, reconnect durability and shared write-limit tests passed.
- `RELAY_RESET_TOKEN` was securely generated and stored in Vercel as a **Production Secret**, with a private ignored local operator copy. Real HTTP verifies unauthenticated reset = 403, correct operator reset = 200 and cooldown reset = 429.
- Full Chromium walkthrough passed on the corrected production-target deployment `relay-solveai-e7bywi3u0-parthhhh.vercel.app`, using authenticated CLI cookies while staging remained protected. Desktop/mobile screenshots were inspected. Existing approval and export gates remained enforced.
- The complete `test:browser` walkthrough was subsequently repeated on the public production URL without authentication after an operator reset; all lifecycle, invalidation, approval, export and desktop/mobile interactions passed.
- Public production domain serves HTML/API successfully without Vercel authentication. Standard Protection remains enabled for previews/generated URLs. The temporary automation bypass created by CLI testing was revoked after a settings read unexpectedly printed it; verification confirmed no automation bypass remained. It was never added to Git or application source. No broader Trusted Sources rule was added.
- `BASE_URL=https://relay-solveai-parthhhh.vercel.app npm run test:production` passed: real synthetic joiner creation, denied readiness, access/device records, activation, source invalidation, CSV questionnaire import, rejected mismatched control/evidence, blocked approvals before source/evidence review, revised source, both fresh approvals, approved-only formula-safe CSV, answer-edit invalidation, offboarding start/denial/revocations/device return/closure, audit records, reset/origin denial and identical repeated reads.
- A fresh independent connection through the pooled Neon URL matches the public API's people, access, devices, reviews, evidence, questions, tasks and audit history, confirming writes are in the intended durable database.
- Unauthenticated public Chromium checks passed for all six navigation destinations at 1440×1000 and 390×844, modal fields/Escape, disabled public reset, no document overflow, no page errors or HTTP 5xx responses. Screenshots: ignored `test-results/production-desktop.png` and `test-results/production-mobile.png`.
- Vercel Git connection to the existing `Parthhhhhh30/relay-solveai` repository succeeded. Local Git HTTPS credentials remain unconfigured; authenticated GitHub connector publication preserves remote history, with source-tree equality checked using read-only Git fetch. Existing local commits are preserved.
- Secret/artifact exclusions cover `.env*` except empty `.env.example`, `.vercel/`, local databases, node_modules, screenshots/downloads, coverage and provider-installed agent skills. Only synthetic seed/QA records are uploaded.

## Hosted failures fixed

1. Auto-selected Node framework used `src/server.js`, which has named exports, rather than the existing default-export API entrypoint. Runtime logged “Invalid export ... default export must be a function or server.” Setting `framework: null` in `vercel.json` selects `api/index.js`; project framework is now Other. Node is pinned to 24.x. Corrected hosted API/browser tests pass.
2. Modal closure before the awaited workspace refresh allowed the next rapid submission to hit `busy` and be silently ignored. The modal now closes after refresh, so it stays open until the current interaction is complete. The real hosted sequential browser walkthrough reproduces the failing sequence and passes after the change. Backend business rules were unchanged.

## Final release checks

- Promoted corrected production deployment: `dpl_AdpjpTPLPYboeEDAjTiMn5uUgeCY`, generated URL `https://relay-solveai-ba6a8mcub-parthhhh.vercel.app`, built with the existing API handler on Node 24.x. Production URL remains https://relay-solveai-parthhhh.vercel.app/.
- A full workspace capture after the public browser walkthrough was **deep-equal** to the new deployment's API response before promotion. People, grants, devices, evidence versions, approval status, questions, tasks and audit records survive redeployment against the same Neon database.
- Public production HTML/API return HTTP 200 without a bypass credential. All four served assets (`app.js`, `style.css`, `index.html`, `favicon.svg`) match the verified local release byte for byte.
- Staged secret/artifact scan and `git diff --check` passed. `npm run check`, all **28 tests**, real HTTP smoke, production browser and live database tests pass. New `tests/production.mjs` is a reusable HTTP regression for hosted workflows; `tests/browser.mjs` supports private authentication cookies for protected staging and catches the hosted rapid-submission sequence.
- Deployment logs subsequently showed HTTP 200 requests and a Node `pg-connection-string` SSL-mode compatibility warning, classified by Vercel as an error-level stderr record. This is a warning about a future driver major-version change, not a failed request; the installed driver treats provider `sslmode=require` as full certificate verification. No HTTP 5xx or page errors were observed in successful release browser/API checks. No log drain, paid monitoring or alerting is configured.
- Git integration built `e17b2348caa410dcdb0bd9cfc2f3045b7a855d4c` into production deployment `dpl_7cfHuNzULaVZpkqopgY4MMdUrb4S` (`relay-solveai-1bfge3tml-parthhhh.vercel.app`). Public state remained deep-equal to the pre-redeployment capture and all served assets matched local/published files. Documentation-only commits may subsequently advance that deployment.
- After verification, the credentialed HTTP reset restored the original recruiter fixture: three fictional people (Ava joining, Noah leaving), five questions and explicitly approved synthetic AC-01 source/answer. Public reset remains disabled; its five-minute cooldown was respected. The README walkthrough is ready to use.
- The tested application changes are committed locally and mirrored to the existing GitHub branch through the authenticated connector, with read-only Git source-tree verification. Local Git history remains preserved; direct Git HTTPS push still needs local credentials for future use.
- Private testing credentials and generated screenshots, response captures and CSV downloads remain excluded. Temporary automation bypass credentials are revoked after testing. Public mutations affect synthetic records only; no real system is provisioned, revoked or notified.

## Architecture and limitations

Hosted state is a versioned JSONB snapshot in one locked Postgres row. Every API operation restores request-scoped SQLite and commits mutation plus invalidation plus audit before reporting success. Reads also serialize. Missing credentials, table, invalid snapshot or failed persistence fail closed; no ephemeral seed fallback is permitted. Local SQLite is never automatically uploaded.

The shared synthetic workspace caps snapshots at 2 MB and successful writes reaching storage at 60 per minute. Visitors can modify fictional records and exhaust that shared allowance. This is not per-user authentication or comprehensive abuse protection. Hosted reset requires an operator credential and five-minute cooldown; public UI reset is disabled. Typed operators/reviewers are unauthenticated, logs are not tamper resistant, and document references are not document contents. No real provisioning, revocation, notifications, certifications or compliance claims occur.
