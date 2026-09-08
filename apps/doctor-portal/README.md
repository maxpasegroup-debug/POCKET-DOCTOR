# Pocket Doctor — Doctor workspace

Phase 3's separate web interface uses Vite, strict TypeScript and native DOM components. It talks only to the versioned REST API, never directly to PostgreSQL.

## Run

    npm ci
    npm run dev

Copy `.env.example` to `.env.local`. Set `VITE_API_BASE_URL` to the backend `/api/v1` URL and allow the exact portal origin in backend `CORS_ORIGINS`. For local OTP testing only, set `VITE_SHOW_DEVELOPMENT_OTP=true` and use the Vite development server. Production bundles never display development codes. Use a backend-provisioned DOCTOR account with an assigned verified profile; users cannot grant themselves access.

    npm test
    npm run build

The build writes `dist/`. Serve over HTTPS with appropriate CSP, frame restrictions and cache policy at deployment. Never place secrets in Vite variables.

## Features and boundaries

Today/upcoming/completed agendas; assigned appointment details; private notes separate from patient summary and follow-up; own biography/languages; timezone, weekly windows, breaks between windows, duration, buffer, excluded dates and booking preference. Backend validation remains authoritative. No fictional credentials or logo.

Tokens remain in memory. Refresh requires sign-in. A 401 clears private UI and session state. Stale responses cannot restore signed-out data. Logout attempts backend revocation and always clears the local session; failure is disclosed. API errors are friendly. Dynamic data uses DOM text content, never interpolated HTML. No private-data logging.

Provider connection remains unavailable. Only marked demo accounts expose lifecycle simulation controls; backend time/status checks still apply. Real video connection and production OTP require providers. The agenda reflects the backend's latest 100 appointments; pagination is future work. System fonts and text branding remain until the approved logo is supplied. No Phase 4 functionality.
