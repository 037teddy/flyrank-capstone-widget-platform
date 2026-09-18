# Embeddable Widget & Lead-Capture Platform

A backend platform that lets customers embed lead-capture widgets on any website with one `<script>` tag, and safely handles everything the public internet throws back — validated, spam-filtered, enriched with location, and dashboarded. Built for the FlyRank Backend AI Engineering internship capstone.

## Architecture

```
Widget Owner (authenticated, API key)
  → Widget Management API → Widget DB (tenant-isolated, proven: cross-tenant access → 404)
  → embed snippet: <script src=".../widget.v1.js?id=abc123"></script>

Customer Website (any origin)
  <script src="widget.v1.js?id=123">
  → GET /widgets/:id/config (public · cached 60s · CORS)
  → renders form

Website Visitor
  → POST /submissions (public · CORS · rate-limited 10/min per IP)
    | Zod validation — bad/oversized payload? → 4xx, never 500
    | honeypot check — bot? → fake 200, silently dropped
    | rate limit — burst? → 429, service stays up for others
    | geo enrichment: Provider A (ip-api.com) —fails→ Provider B (ipapi.co) —fails→ store anyway, no geo
    | store submission
    | confirmation notification (failure never blocks the response)

Widget Owner (authenticated)
  → GET /dashboard/submissions, GET /dashboard/stats
```

## Install & Run

Requires Docker Desktop.

```bash
cp .env.example .env
docker compose up
```

Seeds two test tenants automatically (see below for their API keys, used only for local testing — never real secrets).

**To test the cross-origin embed locally:**
```bash
cd test-site
npx serve -p 5500
```
Open `http://localhost:5500` (or your LAN IP) in a browser — genuinely a different origin than the API's port 3000.

## Environment variables

See `.env.example`. `MOCK_GEO_PROVIDER_A` / `MOCK_GEO_PROVIDER_B` (`success`/`fail`) let you deterministically prove the geo fallback chain without depending on real API uptime or rate limits — see EVIDENCE.md.

## Data model

- **tenants** — id, name, api_key
- **widgets** — id, tenant_id, type, title, description, fields (JSON), button_text, display_options
- **submissions** — id, widget_id, tenant_id, data (JSON), ip_address, country, city, geo_provider_used

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/widgets` | API key | Create a widget |
| GET | `/widgets` | API key | List your widgets |
| GET | `/widgets/:id` | API key | Get one widget |
| PUT | `/widgets/:id` | API key | Update a widget |
| DELETE | `/widgets/:id` | API key | Delete a widget |
| GET | `/widgets/:id/config` | none (public) | Widget render config — cached 60s |
| GET | `/widget.v1.js` | none (public) | The embed script — cached 1 year, versioned |
| POST | `/submissions` | none (public) | Visitor form submission |
| GET | `/dashboard/submissions` | API key | Your recent submissions |
| GET | `/dashboard/stats` | API key | Totals, per-widget counts, geo breakdown |

Authenticate with `Authorization: Bearer <api_key>`.

## Multi-tenant isolation

Every widget/submission query is scoped by `tenant_id`, including UPDATE and DELETE, not just reads. A tenant probing another tenant's widget ID gets `404` (not `403`), so existence can't be inferred. Proven in EVIDENCE.md.

## Abuse protection

- Rate limiting: 10 submissions/IP/minute, proven at the exact boundary and recovery after the window resets
- Honeypot: a hidden `website` field — filled means bot; returns a convincing fake success, stores nothing

## Enrichment fallback chain

`ip-api.com` (Provider A) → `ipapi.co` (Provider B) → no geo data, submission still succeeds either way. All three branches proven deterministically via `MOCK_GEO_PROVIDER_*` env toggles in EVIDENCE.md, plus one genuine real-world failure (Provider B's actual rate limit) observed and handled correctly during testing.

## Safe side effects

The confirmation notification always runs after the submission is already stored, wrapped in its own try/catch — a forced failure (`FORCE_NOTIFICATION_FAILURE=true`) never changes the HTTP response.

## Testing evidence

See `EVIDENCE.md` for full request/response transcripts against every requirement.

## Limitations

- Geo lookups against `localhost`/loopback IPs are substituted with a known public IP (`8.8.8.8`) for local dev/testing, since no provider can geolocate a private address — documented, not hidden
- Widget UI is intentionally minimal (a plain form) — the grading focus is backend hardening, not frontend polish
- Email/webhook side effect is simulated via console logging, not a real email provider — failure-tolerance is what's graded, per the brief's realistic-scope guidance
- Auth is simple API-key based, not a full OAuth/session system — appropriate for this capstone's focus on public-endpoint hardening rather than identity