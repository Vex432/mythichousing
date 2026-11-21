# Open House Relay — Deployment and Sync Checklist

This repository publishes to the Netlify project `mythichousing` from `main`.

## Form → Mission Control

- The static website submits `open-house-requests` through Netlify Forms.
- `netlify/functions/sync-to-sheet.mjs` forwards matching signed `formSubmitted` events to a private Google Apps Script web app.
- In Netlify's project environment variables, set `RELAY_APPS_SCRIPT_URL` to the deployed Google Apps Script `/exec` URL and `RELAY_SYNC_KEY` to the matching Google Apps Script Script property. Enable the Functions scope for both.
- The Apps Script web app must execute as its owner; its receiver validates the shared secret before writing rows to the private **Request Queue** spreadsheet tab.
- The GitHub `integrations/google-apps-script/Code.gs` file is source code, **not** an automatically updated Apps Script deployment. Updates to this file must also be pasted/deployed in Google Apps Script.
- After a *successful* Netlify production deployment, submit a single non-sensitive test MLS request, confirm it appears under Netlify Forms, then confirm one row appears in Mission Control.
- Do not assume successful syncing from a GitHub commit, saved environment variables, or a skipped Netlify deployment. Check the actual production deployment and queue.
- Netlify free-plan deployment credits renew on the **billing cycle**, not at midnight. If deploys are marked `Skipped due to account credit usage exceeded`, wait for a new billing cycle or resolve access with Netlify.

## Safety

Do not commit or paste `RELAY_SYNC_KEY`, private test contacts, or user submissions into the repository. Imported listings are **unverified** and require human review before scheduling.

_Last checked: November 21, 2026._
