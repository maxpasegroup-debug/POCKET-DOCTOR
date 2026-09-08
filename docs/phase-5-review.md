# Phase 5 security and code review

**Verdict:** APPROVE for the locally validated, constrained assistant and provider-ready WhatsApp scope.

**Confidence:** MEDIUM. This is an implementation self-review with automated tests, not an independent audit or clinical assessment.

## Scope and findings

Reviewed the new backend assistant module, Prisma relationships, Flutter providers/screens, integration boundaries and tests against the Phase 5 request. No Git repository existed; the implementation and file inventory formed the review scope.

Resolved issues found during implementation:

- Browser testing found that pushing an existing bottom-navigation branch from chat triggered a Flutter `HeroControllerScope` assertion. Assistant destinations now switch existing shell tabs with `go` and push only detail routes. A regression test uses the real app router, auth state and all existing shell branches.

- PostgreSQL advisory locks initially used a raw query returning an unsupported `void` column; switched to the same execute-raw pattern used by commerce.
- Chat context initially acquired additional database connections while holding a transaction. Queries now use the same transaction connection and select only required fields, avoiding a small-pool deadlock under concurrency.
- The WhatsApp inbound adapter now shares that transaction too. Five simultaneous linked requests pass without nested-transaction connection starvation.
- WhatsApp retries now derive stable request IDs from provider message IDs and use a dedicated daily conversation, preventing duplicate app messages and accidental insertion into an unrelated current chat.
- User confirmation in the authenticated app is required after a signed WhatsApp link nomination. A forwarded code alone cannot complete account linking.
- Flutter network retries retain the draft and reuse a send key. Account-dependent providers invalidate when the signed-in identity changes.
- A UTF-8 BOM in ignored test tooling caused its JSON parser to print temporary runtime configuration. The disposable local database password and session secret were rotated immediately, and the runtime loader now withholds configuration in errors. No production credentials were involved or added to source.

## Verified boundaries

- Every app API requires USER authorization. Strict input contracts reject user-ID injection. Conversations, messages, memory, goals, check-ins and reminders use server-derived ownership.
- Context uses limited program progress, appointment metadata, visible catalogue data and owned order status. Tests create actual isolated records and prove private clinical notes and addresses are absent.
- Models have no SQL, network tools, administrative functions or mutation access. Output is an exhaustive validated intent enum. Unsafe or arbitrary provider text is not rendered.
- Emergency routing recommends immediate in-person/local emergency help without positioning AI or online booking as emergency care. Diagnosis/prescription/medication-change prompts receive a professional-care boundary.
- Provider failures, timeouts, malformed/oversized responses and lack of consent fail closed. Per-user quotas are persisted independently of IP and include failed provider attempts.
- Linking codes have 256 bits of randomness, are hashed, expire in five minutes and cannot be reused after confirmation. Signed raw webhook verification, business-ID checks, unique WhatsApp identities and receipt deduplication protect channel mapping.
- No live AI keys, WhatsApp secrets, payment credentials or ordinary health message contents are committed/logged by the application. The provider adapter is backend-only.

## Practical limitations

The response set is intentionally constrained. Regex safety routing is not a clinically validated or comprehensive multilingual detector. Real-model evaluation, clinician-reviewed content, production privacy/retention decisions, deployed encryption/backup configuration and independent security assessment remain necessary before launch. The official WhatsApp outbound adapter, durable delivery queue, approved templates and operational reminder delivery are not enabled. These are documented boundaries, not simulated successful integrations.

Backend route files follow the existing modular service conventions; future growth should split personal-record routes further if they become harder to maintain. The WhatsApp webhook processes bounded payloads synchronously for local validation; production delivery requires durable asynchronous processing and load tests. No Phase 6/7 implementation is included.
