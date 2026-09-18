# Design — Embeddable Widget & Lead-Capture Platform

## Problem
Customers need to embed a lead-capture widget (signup form / CTA) on their own websites with one script tag. Visitors on those external sites submit the form; the submission must be validated, protected from abuse, enriched with location, stored safely, and shown to the widget's owner — without ever trusting the calling browser.

## Data model

**tenants**
- id (uuid, pk)
- name (text)
- api_key (text, unique) — used to authenticate the owner's dashboard/management requests
- created_at (timestamp)

**widgets**
- id (uuid, pk)
- tenant_id (uuid, fk → tenants)
- type (text: 'signup' | 'cta' | 'popover')
- title (text)
- description (text, nullable)
- fields (jsonb) — form field definitions
- button_text (text)
- display_options (jsonb, nullable)
- created_at (timestamp)

**submissions**
- id (uuid, pk)
- widget_id (uuid, fk → widgets)
- tenant_id (uuid, fk → tenants) — denormalized for fast tenant-scoped queries
- data (jsonb) — the submitted form fields
- ip_address (text)
- country (text, nullable)
- city (text, nullable)
- geo_provider_used (text, nullable) — 'A', 'B', or null if both failed
- created_at (timestamp)

Indexes: `widgets(tenant_id)`, `submissions(widget_id, created_at)`, `submissions(tenant_id)`.

## The embed flow

1. Owner creates a widget via authenticated API → gets back an embed snippet: `<script src=".../widget.js?id={widgetId}"></script>`
2. Customer pastes that script tag into their own site
3. `widget.js` (a small, versioned, cached script) runs on the customer's page, fetches `GET /widgets/:id/config` (public, cached, CORS-enabled), and renders a simple form
4. Visitor submits → `POST /submissions` (public, CORS-enabled) — validated, rate-limited, spam-checked, geo-enriched, stored
5. Owner views submissions + stats via authenticated dashboard API

## API contracts

- `POST /widgets` / `GET /widgets` / `GET /widgets/:id` / `PUT /widgets/:id` / `DELETE /widgets/:id` — authenticated, tenant-scoped
- `GET /widgets/:id/config` — public, cached (`Cache-Control: max-age=60`), CORS-enabled, returns widget rendering config only (no tenant-internal data)
- `GET /widget.js` — public, versioned/long-cached static script
- `POST /submissions` — public, CORS-enabled, rate-limited, validated
- `GET /dashboard/submissions` / `GET /dashboard/stats` — authenticated, tenant-scoped

## Auth strategy

Simple API-key auth for this capstone (not full Supabase-style auth, since the focus here is the public-facing hardening, not identity): each tenant has an `api_key`; management/dashboard routes require `Authorization: Bearer <api_key>`, checked against the tenant table.

## Non-goal

This capstone does not build a real visual widget UI builder or a production JS bundler — the widget script is minimal (a form + submit handler), and there's no drag-and-drop customization. The grading is backend hardening (CORS, rate limiting, enrichment fallback, safe side effects), not frontend polish.