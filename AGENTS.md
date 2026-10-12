# RELAY Engineering instructions for Codex or another coding agent

Goal: maintain this as an **honest and functional** portfolio application proof, NOT a claimed SolveAI internal product.

Before every change:
- Read README.md, src/db.js, src/service.js, src/server.js, and relevant public files.
- Map proposed features to the SolveAI Operations generalist vacancy: hands-on IT, access, finance/compliance administration, GTM events, contracts and hiring.
- Prefer depth in people/access ↔ customer assurance over more dashboard pages.
- Identify and challenge correctness risks, including false readiness, stale approvals and invented compliance claims.

Non-negotiable: no green status or customer-facing answer without explicit source evidence, correct control mapping, freshness and recorded human approval. Changes to the access register must stale derived evidence. Real systems are **never** provisioned, revoked or notified by this prototype.

Quality order: (1) correct workflows and failure handling; (2) complete interactive UX; (3) accessibility and mobile; (4) visual polish; (5) documentation.

Do not introduce an LLM/autonomous compliance answer generator, marketing fluff, fake SOC2 certifications, or unsupported integrations. Never put real employee, customer or company data into the demo.

For every meaningful modification:
1. Run `npm run check` and `npm test`.
2. Add a regression test for business rule changes, especially denied transitions and invalidation.
3. Exercise the affected UI interaction in a browser if a browser tool exists; do not falsely claim a browser test if blocked.
4. Explain limitations precisely and keep user-facing promises matched to actual code.
5. Keep `README.md` and the demo script accurate.

Human intervention needed only for local git credentials, creating a new remote repository, and third-party deployment account approvals. Continue with local build/testing autonomously.
