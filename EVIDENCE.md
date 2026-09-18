# Evidence

## Widget management: authenticated CRUD + tenant isolation

**Create (Tenant Alpha):**


**Tenant Alpha reads their own widget:** `200 OK`

**Tenant Beta attempts to read Tenant Alpha's widget:**


**Tenant Beta attempts to delete Tenant Alpha's widget:**

Widget confirmed still present afterward. Every widget query is scoped by `tenant_id`, so cross-tenant access returns `404` (not `403`) — an attacker probing for other tenants' widget IDs cannot distinguish "doesn't exist" from "exists but isn't yours."

## Public submission API
_(added in Phase 2 continued)_

## Abuse protection
_(added in Phase 2 continued)_

## Enrichment & safe side effects
_(added in Phase 2 continued)_

## Widget delivery
_(added in Phase 3)_

CORS: every response includes `Access-Control-Allow-Origin: *`, confirmed on `/submissions`, `/widgets/:id/config`, and `/widget.v1.js`.

## Abuse protection

**Rate limiting** — sent submissions numbered 9 through 15 against a 10/minute limit:

## Public submission API

Malformed payload (missing `widgetId`):
Confirms the limit is enforced exactly at the boundary and recovers — legitimate traffic isn't permanently blocked.

**Honeypot** — a hidden `website` field filled (as a bot would):

## Enrichment & safe side effects

**Real lookup (Provider A, using a substituted public IP since localhost isn't geolocatable):**

Also observed a genuine real-world case during testing: Provider B (ipapi.co) hit its real rate limit (`429`) mid-testing, and the system degraded gracefully exactly the same way — proving the fallback logic handles authentic failures, not just mocked ones.

**Safe side effect** — the confirmation notification always runs after storage, and its own internal try/catch means a forced failure never affects the HTTP response:  

## Widget delivery

Config endpoint returns correct cache headers:

GET /widgets/:id/config
→ Cache-Control: public, max-age=60

Widget script served with long-cache, versioned headers:
GET /widget.v1.js
→ Cache-Control: public, max-age=31536000, immutable

## Cross-origin rendering (Probe 1)

The widget script was embedded on a genuinely separate origin (`test-site/index.html`, served via `npx serve` on port 5500 — a different origin than the API's port 3000) and rendered correctly. Submitted a real form entry through the browser:

- Browser console confirmed the request succeeded after fixing a real CORS preflight bug (see BUILDLOG.md)
- Submission appeared immediately in `GET /dashboard/submissions`, correctly linked to the right widget:
```json
{"data":{"email":"teddymbayaki@gmail.com"},"widget_title":"Join our newsletter",...}
```

## Dashboard
