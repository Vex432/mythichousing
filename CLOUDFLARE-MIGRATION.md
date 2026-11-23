# Open House Relay — Cloudflare Pages migration

**Status: code prepared in a separate GitHub branch. NOT DEPLOYED OR LIVE.**
Existing Netlify production site and stored submissions remain untouched.

## Free deployment setup

1. In [Cloudflare Dashboard](https://dash.cloudflare.com/), use **Workers & Pages → Create → Pages → Connect to Git**.
2. Select the existing repository: **Vex432/mythichousing**.
3. For the first deployment use production branch **cloudflare-pages-migration** to keep Netlify's \`main\` branch unchanged.
4. Build command: \`node scripts/build-cloudflare.mjs\`
5. Build output directory: \`dist\`
6. Root directory: repository root (\`/\`). Framework preset: **None**. No paid plan required.
7. The \`functions/api/\` directory is loaded by Pages Functions from the repository root. Only public files are copied into \`dist\`, so Google Apps Script and other backend source files are not statically published.
8. Before inviting anyone to use the new URL, configure the four variables below and deploy. The HTML deliberately disables submissions until ready.

## Cloudflare Pages → Settings → Variables and Secrets

| Variable | What to enter | Visibility |
|---|---|---|
| \`RELAY_APPS_SCRIPT_URL\` | Existing deployed Google Apps Script \`/exec\` URL used by Netlify | Server environment variable |
| \`RELAY_SYNC_KEY\` | Existing secret from Google Apps Script → Project Settings → Script properties | **Secret** |
| \`TURNSTILE_SITE_KEY\` | Site key from a **free** Cloudflare Turnstile widget registered for the exact new \`*.pages.dev\` hostname | Public (served by \`/api/public-config\`) |
| \`TURNSTILE_SECRET_KEY\` | Secret key from the same free Cloudflare Turnstile widget | **Secret** |

Do not commit, send in chat, or screenshot the two secret values.

Turnstile setup: choose a **free** widget, add the resulting Cloudflare Pages production hostname to its allowed hostnames, then set both keys as above. A second hostname or custom domain may require adding it to the widget too.

## Google Apps Script action (required)

Cloudflare submits all three forms to the **existing** Apps Script receiver. GitHub changes do **not** automatically update a deployed Apps Script web app.

1. Open the existing Open House Relay Operations Tracker Google Sheet → Extensions → Apps Script.
2. Replace the script with the updated \`integrations/google-apps-script/Code.gs\` content **from this migration branch**.
3. Save, then **Deploy → Manage deployments → Edit** the existing Web app and select a **new version**. Keep **Execute as Me** and access **Anyone** (the receiver itself validates \`RELAY_SYNC_KEY\`).
4. Confirm the resulting \`/exec\` URL is still the value used in Cloudflare. If the deployment URL changed, update \`RELAY_APPS_SCRIPT_URL\`.
5. Existing Script properties (\`RELAY_SYNC_KEY\`, \`RELAY_SHEET_ID\`) remain on the same Apps Script project; do not rotate or expose the key unnecessarily.

The updated receiver keeps listing data in **Request Queue**, and creates **Partner Inquiries** and **Updates Opt-ins** tabs upon receiving those forms. It never merges unverified inquiries into the vetted Agent Contacts sheet.

**Privacy requirement:** Before accepting real submissions, ensure the operations tracker sharing is **Restricted**, not "Anyone with the link", then share it explicitly with authorized collaborators (e.g. Schmid). The sheet stores names, emails, phone numbers and safety/access notes.

## Safety and acceptance test

- Existing Netlify live site stays available while Cloudflare is being prepared.
- Turnstile verification is performed server-side; missing config fails closed.
- Honeypot remains. Only recognized form fields are sent, with field limits.
- Secrets are never returned to the browser.
- Submit one authorized non-sensitive trial listing and confirm one new row under **Request Queue**.
- Submit a trial Partner Inquiry and verify **Partner Inquiries**.
- Submit an opt-in using an authorized test inbox and verify **Updates Opt-ins**.
- Verify duplicate request behavior and phone/mobile layout. Do not assume code/config alone means the integration works.
- Netlify's existing stored submissions are **not imported** by this migration.

## Maintenance

Website changes live in the GitHub repository. During transition, update the \`cloudflare-pages-migration\` branch to publish Cloudflare. **Do not merge to \`main\` or repoint the old Netlify project** until Cloudflare production forms have been tested and the team agrees to switch.

\`node --test tests/cloudflare.test.mjs\` runs basic backend regression checks in a modern Node.js environment.

### Constraints

Cloudflare Pages/Workers have free-tier quotas. Stay on **Free** and monitor usage; never enable paid upgrades just to deploy this version. The Cloudflare account must be connected to GitHub in the Cloudflare Dashboard, since ChatGPT does not currently have a direct Cloudflare management connector.
