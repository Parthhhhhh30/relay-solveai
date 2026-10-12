# Codex mission: RELAY for SolveAI — finish, verify, publish

Read AGENTS.md, PROJECT_DECISION.md, QA_REPORT.md, README.md and inspect the code before any edits. This is an independently built, synthetic portfolio app for a SolveAI Operations application. Not affiliated with SolveAI. The user requests an actually functional product, improved responsive UI, public GitHub repository and live Vercel deployment. Do not stop to ask questions except for real interactive account/permission/credential requirements or decisions with material costs. Do not pretend verification or deployment succeeded.

## Blocking architectural issue
Current project has a stateful Node HTTP server and node:sqlite file on local disk. Do NOT simply deploy this to Vercel serverless and claim persistence. Select and implement a legitimate Vercel-supported execution model, durable datastore (prefer free hosted Postgres/Neon or equivalent if accessible through existing accounts; if not, request the single needed connection), schema/migrations, and secure demo reset. Preserve original domain rules and tests; ensure their behavior persists in deployed environment. No secrets in Git. No real people's information in seed or showcase. If durable store is not possible without accounts, clearly report the blocker rather than shipping a broken deployment. For public synthetic demo protect mutations against abuse at least with practical rate limiting and data reset policy; label limits and absence of real-world authentication honestly.

## Product and scope
Prioritize: (1) joiner and leaver lifecycle including assets, access, completeness gates; (2) evidence library, review owner approval and freshness, questionnaire CSV import/export; (3) provable cross-workflow invalidation when access-register state changes; (4) actionable tasks for finance/contracts/hiring/GTM; (5) polished responsive UI with good affordances, loading/error/empty states, keyboard navigation and mobile functionality. Avoid building another broad, shallow BACKBONE clone or introducing misleading AI compliance claims.

## Work plan (do it, don't just plan it)
1. Run existing checks and tests, reproduce failing scenarios, inspect all routes, inputs and database safety.
2. Create or improve automated domain, API, browser and accessibility tests especially mutation-to-evidence invalidation and stale export rejection.
3. Fix bugs, implement deployment-safe backend and durable persistence, error handling and validation. Choose minimal dependencies and a maintainable design.
4. Polish actual UI interactions and visual quality. Use Playwright to verify desktop and mobile workflows and capture screenshots; inspect for overflow and broken interactions.
5. Run all lint/typecheck/tests/build checks; document exact outcomes, limitations, test commands and proof paths.
6. If gh CLI authenticated, create **new** public GitHub repo `relay-solveai` under authenticated account, commit project without credentials, and push `main`. Never overwrite existing repository. If repo exists, examine it and pause before replacing content.
7. If Vercel CLI authenticated, connect project to GitHub repo and deploy production; verify actual live URL through HTTP/browser and exercise key flows including persistence after reload. If Vercel account connection or credential needed, pause only for that exact action; resume automatically after setup.
8. Update README with honest tech stack, reproducible setup, synthetic data disclaimer, deployment URL, 2–3 minute recruiter walkthrough, and real limitations. Produce a concise QA_REPORT.md with test evidence, not just claims.

## Strict release gates
A static UI, no-op buttons, volatile data incorrectly described as persistent, unapproved export, missing audit traces, broken mobile layout, unauthenticated production data exposed as real, or deployment without actual verification = NOT DONE. Use clear reviewable commits. Avoid paid services and costs without user approval. Do not upload private credentials. Do not claim production-grade enterprise security; it's a portfolio prototype.

Now start executing end-to-end. Only stop at a genuine blocker requiring the user to act.
