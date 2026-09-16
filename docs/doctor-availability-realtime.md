# Doctor availability realtime

## Audit before implementation

`RegistrationService.review` in `services/api/src/modules/doctor-registration/service.ts` locks the Doctor row and only approves SUBMITTED/UNDER_REVIEW applications. Approval sets VERIFIED and verifiedAt; it does **not** enable acceptingAppointments. Submission explicitly sets acceptingAppointments=false. `ConsultationService.updateAvailability` is the Doctor-owned operation that enables appointment acceptance under the same Doctor-row lock.

Patient discovery is `GET /api/v1/doctors`, with `GET /api/v1/doctors/:id` for details. Its existing filter requires VERIFIED and acceptingAppointments=true, with demo visibility controlled by DEMO_CONSULTATIONS. Approval alone does not make a newly submitted Doctor discoverable. This implementation preserves that distinction; DOCTOR_AVAILABLE describes public discovery, not a guarantee of an open appointment slot or a live video provider.

The existing Patient Riverpod doctorDiscoveryProvider uses ConsultationRepository and those REST routes. Authentication uses opaque session tokens, validated by IdentityService against PostgreSQL, expiry, account status, role and staging-test eligibility. No additional authentication system is needed.

## Implemented transport and authentication

- Endpoint: `/api/v1/realtime/patient`, on the existing API server/port.
- Hosted URL derived from the Patient API configuration: `wss://pocket-doctor-production.up.railway.app/api/v1/realtime/patient`.
- Fastify WebSocket plugin is registered before application routes. No Socket.IO, Redis, BullMQ, separate service, database connection table, or migration.
- Client handshake offers `pocket-doctor.v1` and `session.<existing session token>` as WebSocket subprotocols. The server negotiates **only** `pocket-doctor.v1`. The token is neither a URL parameter nor echoed in the selected protocol. This supports native and browser Flutter without introducing separate credentials.
- The existing IdentityService verifies the session. Only an active, eligible session with exactly the USER role is admitted; Doctor, Admin, mixed-role, expired and revoked sessions are rejected. Client-selected roles/topics/commands are unsupported.
- Supplied browser Origin must match the existing CORS allowlist. Query parameters are rejected. The token-carrying protocol header is redacted from API logs; external proxies must likewise avoid logging it.
- Successful REST logout immediately disconnects that token's sockets. Heartbeats and each broadcast revalidate sessions through the existing database-backed verifier; revoked/inactive recipients fail closed.

## Publication and payload

The existing transaction locks the Doctor row. After commit, only a false-to-true public availability transition invokes the injected `PatientEventPublisher`. The in-memory implementation rereads the Doctor before delivering the event. Public state requires VERIFIED, acceptingAppointments=true and a non-demo Doctor. Pending, rejected, suspended and inactive Doctor states never qualify.

The two hooks are `RegistrationService.review(APPROVE)` and `ConsultationService.updateAvailability`. Neither changes lifecycle rules. New registrations normally require approval **and then the Doctor enabling appointment acceptance**. Approval does not automatically enable it. Repeated approval, concurrent saves of the same availability, and unrelated profile edits do not duplicate a transition event.

```json
{
  "type": "DOCTOR_AVAILABLE",
  "doctor": {
    "id": "<public Doctor ID>",
    "name": "<public name>",
    "specialization": "<public specialty>",
    "profileImage": null
  }
}
```

An explicit field allowlist excludes phone, email, credential identifiers/documents, internal review fields, notes, records and secrets. `profileImage` uses the existing public photo URL when present. Demo Doctors are not announced.

## Patient behavior

The Riverpod service starts after session establishment/restoration, using the existing API client's token. It pauses in the background and reconnects on resume. Connection failures use exponential backoff of 2, 4, 8, 16, 32 and 60 seconds plus up to one second of jitter. A 12-second READY deadline bounds unsuccessful handshakes; 30 seconds of stability resets backoff. Logout/disposal cancels sockets, subscriptions and timers.

READY on initial connection and reconnection invalidates and fetches existing Doctor Discovery REST data. A valid DOCTOR_AVAILABLE event triggers the same refresh and an existing REST Doctor-detail visibility check before showing “A new doctor is now available.” The “View doctors” action clears discovery filters and opens the existing `/consult` route. No event fields are treated as authoritative Doctor data. Malformed/unknown events are ignored. REST failures retain the existing error/retry state and do not produce a false success notice.

## Resource bounds and delivery limitations

- In-memory registry: at most 1,000 connections per API instance, three per user; upgrade limit 20/minute under the existing rate limiter.
- Heartbeat: 30-second ping/pong with session checks; failed sockets are removed. Incoming client messages are unsupported; maximum WebSocket frame payload is 1 KiB.
- Broadcast verification concurrency is bounded to ten; recipients with more than 64 KiB buffered output are disconnected.
- At most 64 ephemeral publication tasks wait in memory. Overload/failure drops are safely logged without private data. Approval does not wait for recipient delivery.
- There is no durable queue, replay or exactly-once delivery guarantee across process crashes. Offline/reconnected clients recover through authoritative REST. A later genuine unavailable-to-available transition may emit again; this is transition deduplication, not a permanent “announced” database marker. Patient notifications deduplicate up to 128 Doctor IDs per session.
- Publication is process-local: run one API replica for current delivery semantics. A future cross-instance publisher adapter is required before broadcasts can reach patients connected to other API replicas. Business services depend only on the publisher interface.

## Railway validation

No deployment or Railway variable/volume changes were performed. A read-only WebSocket upgrade probe to the hosted endpoint returned **HTTP 404** on 2026-09-16. The new route is not available in that deployment; authenticated hosted delivery is **NOT VERIFIED**.

After deploying the updated existing API service and installing the updated Patient build, perform an authenticated hosted test with an eligible Patient session and the existing Doctor approval/availability flow. Verify READY, event reception, REST refresh, logout and reconnect through the public domain. Use the existing HTTPS domain/port; no separate WebSocket service is required. Native Flutter does not require a browser Origin; any Patient web origin must be in the existing explicit allowlist.

Transport references: [Fastify WebSocket plugin](https://github.com/fastify/fastify-websocket), [Flutter WebSocket channel](https://pub.dev/packages/web_socket_channel), [Railway public networking](https://docs.railway.com/networking/public-networking).

## Validation evidence (2026-09-16)

| Check | Result |
| --- | --- |
| Full backend suite against isolated local PostgreSQL | 218 passed, 0 failed, 1 skipped; 219 total |
| New backend realtime tests, included above | 10 passed, 0 failed, 0 skipped |
| Full Patient Flutter suite | 102 passed, 0 failed, 7 skipped |
| New Patient realtime tests, included above | 4 passed, 0 failed, 0 skipped |
| Separate Doctor Flutter suite; source unchanged by this task | 53 passed, 0 failed, 0 skipped |
| Backend `npm run typecheck` | PASS |
| Backend `npm run build` including Prisma generation | PASS |
| Patient `flutter analyze` | PASS |
| Patient hosted-testing Android debug APK | PASS; release rebuild generated 2026-09-16 10:41 IST |
| Source/config/docs secret-pattern scan | PASS, no findings; not a Git-history or external-secret-store audit |
| Hosted WebSocket probe | HTTP 404; authenticated hosted delivery NOT VERIFIED |
| Physical-device acceptance | NOT TESTED |

The one backend skip is the opt-in encrypted storage acceptance test requiring a real OS scanner. The seven Patient skips are existing opt-in API smoke tests. Backend integration fixtures were created/cleaned only in the isolated local test database, never Railway. Logs: ignored `artifacts/realtime-backend-tests.log`.

Coverage includes actual network WebSocket handshakes, PostgreSQL sessions and Doctor lifecycle transitions; authorization/origin failures; concurrent transition suppression; public payload allowlisting; revoked/suspended/deactivated session handling; connection cleanup; Flutter reconnect/backoff, READY deadline, logout, malformed events, REST refresh and snackbar navigation.

APK command (from `apps/mobile`): `flutter build apk --debug --dart-define-from-file=config/railway-testing.json`. Output: `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk` (208,832,317 bytes). APK kernel inspection confirmed the Railway API URL, DOCTOR_AVAILABLE parser, realtime route and public session protocol are included. The existing configuration specifies staging and was not modified. SHA-256: `e5f0478e32a6f30a26b2a77631722e3c7a0cb02dbb42b644a9b505c7360033b4`.

### Release validation

`npm ci` installed the locked backend dependencies with zero reported vulnerabilities. Backend build (including Prisma generation), type-check and Prisma validation passed again. Patient analysis and the complete Patient suite passed again (102 passed, 0 failed, 7 skipped).

The working-tree backend suite passed again (218 passed, 0 failed, 1 skipped). A separate candidate built from HEAD plus only the realtime backend files also passed build/type-check and the full suite: **216 passed, 0 failed, 1 skipped**. Two additional working-tree tests belong to the unrelated Admin read-only changes and are intentionally outside this release; they were not deleted or weakened.

The first temporary candidate run had one migration-audit failure (215 passed, 1 failed, 1 skipped): `git archive` exported LF SQL while the isolated local database recorded the unchanged Windows CRLF checkout checksums. All 15 migration files were verified identical after line-ending normalization. Only temporary snapshot files were materialized with the existing Windows checkout line endings; repository migrations and database history were untouched. The full candidate rerun then passed, including the migration audit. Logs are ignored: `artifacts/realtime-release-backend-tests.log`, `artifacts/realtime-release-candidate-verified-tests.log`, and `artifacts/realtime-release-patient-tests.log`.

These are pre-deployment checks, not evidence of a hosted authenticated connection or a hosted Admin-to-Patient event. No Railway variables, database schema, or production records were changed during release preparation.

## Feature files

- `services/api/src/modules/realtime/{events,types,patient-connections,routes}.ts` (new)
- `services/api/src/app.ts`
- `services/api/src/modules/doctor-registration/{routes,service}.ts`
- `services/api/src/modules/consultations/{routes,consultation-service}.ts`
- `services/api/test/realtime.test.ts` (new)
- `services/api/package.json`, `services/api/package-lock.json`
- `apps/mobile/lib/features/realtime/{patient_realtime,realtime_providers,realtime_notice}.dart` (new)
- `apps/mobile/lib/app.dart`
- `apps/mobile/test/realtime_test.dart` (new)
- `apps/mobile/pubspec.yaml`, `apps/mobile/pubspec.lock`
- `docs/doctor-availability-realtime.md` (this document)

Pre-existing Admin authentication/read-only-review edits and separate Doctor project edits were preserved and are not part of this feature. No OTP configuration, production data, schema, Railway configuration, volume configuration, or Doctor application source was changed by this task.
