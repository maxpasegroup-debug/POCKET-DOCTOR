# Production runbook

This is an operator procedure, not a record of deployment. No production service,
DNS, real payment, real message or public release was activated in Phase 7.
Start with [configuration](production-config.md), [validation](phase-7-validation.md)
and [security findings](phase-7-security-audit.md). Do not enable a domain whose
provider/business acceptance is still blocked.

## Staging and release sequence

1. Assign business, clinical, privacy, security and on-call owners. Resolve the
   technical/business blockers in the readiness matrix; approve scope and rollback.
2. Provision separate staging/production database and secret stores. Require
   private database networking and verified TLS. Create migration-owner and
   runtime identities separately; review `services/api/ops/runtime-role.sql`.
   Never give the API a superuser or migration-owner credential.
3. Build immutable artifacts with the reviewed dependency locks. Run all tests,
   audits and source scan. Pin the release artifact/version and preserve its
   configuration inventory without secret values.
4. Create an encrypted backup and verify restore to a separate environment before
   migrations. Review all SQL and the effect on active sessions/transactions.
   With the migration-owner connection, run `npm run db:validate`,
   `npm run db:deploy`, `npm run db:check`. There is no automatic destructive
   down migration or reset. Reapply reviewed runtime grants after schema changes.
5. Deploy API and worker separately. Verify startup failures, SIGTERM shutdown,
   platform restart policy, `/api/v1/health` and `/api/v1/health/ready`. Then test
   actual runtime-role access, approved CORS origins, HTTPS redirects and trusted
   proxy headers. Readiness does not certify providers.
6. Build client artifacts using actual approved HTTPS endpoints. Deploy portals
   and optional customer web behind HTTPS; test deep links, CSP, asset MIME,
   refresh/logout, session expiry and private-content cache behavior. The generic
   static server is provided; certificates/DNS/ingress are external.
7. Provision administrators out of band with separate TOTP keys. Verify replay,
   failed attempts, expiry, recovery and audit with designated staging accounts.
   Keep a controlled emergency recovery procedure; no shared default login exists.
8. Complete provider-supported sandbox tests and then separately approved small
   live verification for payments/refunds/WhatsApp. Confirm callbacks in the
   provider dashboard and durable ledger/outbox state. Never mark delivery from
   an HTTP acceptance alone or payment from a browser callback alone.
9. Validate real Android and iOS devices, weak network, accessible text sizes,
   physical logout/login and approved brand/store declarations. Store signing
   keys remain private; an unsigned build is not a distributable release.
10. Review remaining blockers and decide launch explicitly. Roll out gradually,
    monitor failures and retain a known compatible previous application artifact.

## Background work and retries

Run `node dist/worker.js` as its own service using the same runtime database role.
Use `node dist/worker.js --once` for a bounded check. Alert if worker cycles stop,
fail repeatedly or backlog age grows. Do not run development seeds in deployed
environments. Scheduled cleanup removes expired sessions/OTPs/action budgets and
handles existing commerce/membership time transitions; it does not silently erase
health records.

For notification PENDING/FAILED, the worker uses bounded claims/backoff. After
three failed unaccepted sends, inspect DEAD_LETTER. UNKNOWN means a request may
have reached the provider: investigate provider evidence and do not force resend.
Manual retry is limited to eligible failed rows without provider references.
WhatsApp notifications require a current linked number, service consent and open
inbound window. No out-of-window templates or promotional sends are configured.

For payments, inspect the ledger and signed ProviderEvent inbox together.
`RECONCILIATION_REQUIRED` is an operational obligation, not successful fulfillment.
Live checkout/event-to-domain reconciliation is still an implementation blocker.
Refund processing commits one intent before POST; reconcile matching provider
refund status. If the first POST times out before returning a refund ID, locate
the exact provider operation through the controlled reconciliation process.
Never repeat it blindly. Do not manually label money refunded without evidence.

## Observability and incident detection

API logs use request IDs, route patterns, methods, status and safe error codes;
never query strings, request bodies, tokens, phone numbers or prompts. Protected
admin metrics expose per-process counts/error counts/latency summaries. Export
metrics to an approved monitoring service and configure alerts in deployment.
No external alert destination has been activated.

Suggested alert conditions require owner-tuned thresholds: readiness failing,
elevated 5xx/latency, database pool/connection saturation, admin-auth failures,
unmatched ATTEMPTED audits, stale payment reconciliation, failed/unknown delivery,
worker silence, backup failure and unusually old unreviewed privacy requests.
Use the request ID for investigation without copying private payloads into tickets.

## Backups and recovery

`npm run db:backup` uses `BACKUP_FILE` and an installed matching PostgreSQL
`pg_dump` (`PG_DUMP_PATH` if not on PATH). It makes a custom archive, refuses an
existing destination, avoids credentials in CLI arguments and emits no raw
connection details. Storage encryption/off-site transfer/scheduling are operator
responsibilities. The API container does not include PostgreSQL backup tools.

Set approved backup frequency, retention, encryption/key ownership and recovery
objectives with the business. Confirm the chosen hosting plan's recovery features
before relying on them. Regularly restore to a fresh isolated database using
`pg_restore --exit-on-error --no-owner --no-acl`, with credentials supplied through
a protected environment. Compare schema/migration counts, key record totals,
constraints/triggers and representative read-only application journeys. Reapply
and test roles separately because archives omit grants. Never restore over the
live database merely to test a backup.

Local evidence: PostgreSQL 18 custom backup restored successfully to a separate
database; 13 migrations and six checked table counts matched; three protection
triggers survived; runtime grants denied audit/consent/invoice modification.
Utilities came from the [official PostgreSQL Windows distribution](https://www.postgresql.org/download/windows/)
and its [EDB binary archive](https://www.enterprisedb.com/download-postgresql-binaries).
This does not validate encrypted off-site recovery, PITR, production RPO or RTO.

## Rollback

| Component | Available procedure / limit |
| --- | --- |
| API / portal / web | Redeploy a retained compatible artifact and restore its reviewed environment settings; no automated release-history service is configured here. |
| Mobile | Halt staged rollout and ship a corrected signed build through the store workflow; already installed apps cannot be remotely uninstalled by this repository. |
| Worker | Stop the service, inspect leases and ambiguous sends before restarting the prior compatible version. Do not reset outbox state to PENDING indiscriminately. |
| Configuration | Restore approved prior values through the secret store; rotate exposed values and invalidate sessions as needed. Do not paste secrets into rollback notes. |
| Database | Prefer an reviewed forward correction. If recovery is necessary, restore a verified backup into a separate environment, reconcile post-backup money-moving events, test, then perform an approved cutover. No automatic down/reset migration exists. |

## Incident response

All incidents follow detection → containment → investigation → recovery → record.

| Incident | Containment and recovery focus |
| --- | --- |
| Payment failure or duplicate callback | Stop affected settlement/checkout paths; retain intent/event IDs; verify provider records and amounts before idempotent reconciliation; notify finance through approved procedures. |
| Data exposure | Restrict affected endpoints/access; revoke sessions/rotate relevant secrets; preserve access evidence without copying private data; involve security/privacy/legal for required communications and recovery. |
| Authentication attack | Review account/IP budgets and MFA audit; suspend affected accounts or revoke sessions; preserve evidence; restore only after identity verification. Do not disable limits to recover convenience. |
| Database outage | Fail readiness and writes safely; check connectivity/pool/storage; pause dependent jobs; restore/reconcile only through the verified recovery process. |
| AI outage or unsafe output | Disable provider processing, preserve minimal event evidence, show safe unavailability, review prompts/output contracts with clinical/security owners before re-enabling. |
| WhatsApp outage | Disable outbound channel, retain queue/status evidence, resolve UNKNOWN states against provider logs; re-enable only consented eligible sends. |
| Notification outage | Keep in-app records, inspect worker heartbeat/backlog, retry only unaccepted eligible failures; do not create duplicate provider delivery. |

After recovery, document scope/timeline/root cause, decisions, data impact and
follow-up tests. Assign owners and deadlines; do not invent external incident
notifications or legal deadlines without qualified review.
