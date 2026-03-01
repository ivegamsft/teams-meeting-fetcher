# Decision: Global Auth Gate for Static Files

**Date:** 2026-03-06
**Author:** McManus
**Status:** Implemented

## Context

All static files (HTML, CSS, JS) and the SPA catch-all route were served without authentication. `curl -sk https://<ip>:3000/` returned HTTP 200 with the full page, no auth required. Only API sub-routes had `dashboardAuth` applied — static file serving and the catch-all were completely unprotected.

## Decision

Added a `globalAuth` middleware function in `middleware/auth.ts`, mounted in `app.ts` between the `/auth` login routes and `express.static`. This creates a single auth gate that protects everything downstream:

- **Static files** (CSS, JS, HTML): Unauthenticated requests → redirect to `/auth/login`
- **API routes** (`/api/*`): Unauthenticated requests → 401 JSON
- **Exemptions:** `/health` (ECS health probes), `/api/webhooks/*` (has own Bearer token auth via `webhookAuth`), `/api/auth/status` (needed by unauthenticated UI to check login state)

Auth methods accepted: Entra ID session, Passport `isAuthenticated()`, API key (`x-api-key` header).

Existing `dashboardAuth` on individual API sub-routes in `routes/index.ts` is kept as defense in depth.

## Files Changed

- `apps/admin-app/src/middleware/auth.ts` — added `globalAuth` export
- `apps/admin-app/src/app.ts` — imported and mounted `globalAuth` after `/auth` routes, before `express.static`

## Impact

- All team members: redeploy admin-app to apply the fix
- Fenster: no infra changes needed, same ports/certs/ECS config
- Hockney: existing tests for API routes should still pass (dashboardAuth unchanged); may want to add tests for static file auth redirect
