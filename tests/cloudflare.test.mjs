// Regression checks for the zero-cost Cloudflare Pages form bridge.
// Run from the repository root: node --test tests/cloudflare.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../functions/api/submit.js", import.meta.url), "utf8");
const { onRequestPost } = await import("data:text/javascript;charset=utf-8," + encodeURIComponent(source));
const configSource = readFileSync(new URL("../functions/api/public-config.js", import.meta.url), "utf8");
const { onRequestGet } = await import("data:text/javascript;charset=utf-8," + encodeURIComponent(configSource));
const target = "https://relay-example.pages.dev/api/submit";
const env = {
  RELAY_APPS_SCRIPT_URL: "https://script.google.com/macros/s/example123/exec",
  RELAY_SYNC_KEY: "test-placeholder-that-is-not-an-actual-secret",
  TURNSTILE_SITE_KEY: "public-key-placeholder",
  TURNSTILE_SECRET_KEY: "private-key-placeholder"
};
const details = {
  "form-name": "open-house-requests",
  contact_name: "Example Visitor",
  email: "example@example.org",
  phone: "555-555-0133",
  mls_area: "Bright MLS",
  mls_numbers: "123456789",
  "cf-turnstile-response": "test-token",
  request_id: "00000000-0000-4000-8000-000000000001"
};
const request = (fields, origin = new URL(target).origin) =>
  new Request(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": origin
    },
    body: new URLSearchParams(fields).toString()
  });

async function run(fields, options = {}) {
  const prior = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, config) => {
    calls.push({ url, config });
    if (String(url).includes("/siteverify")) {
      return Response.json({
        success: options.verify !== false,
        hostname: options.hostname || "relay-example.pages.dev"
      });
    }
    return Response.json({ ok: options.receiver !== false });
  };
  try {
    const response = await onRequestPost({
      request: request(fields, options.origin),
      env: options.env || env
    });
    return { status: response.status, body: await response.json(), calls };
  } finally {
    globalThis.fetch = prior;
  }
}

test("configured public endpoint never exposes secrets", async () => {
  const response = await onRequestGet({ env });
  const payload = await response.json();
  assert.equal(payload.ready, true);
  assert.equal(payload.turnstileSiteKey, env.TURNSTILE_SITE_KEY);
  assert.equal(JSON.stringify(payload).includes(env.RELAY_SYNC_KEY), false);
  assert.equal(JSON.stringify(payload).includes(env.TURNSTILE_SECRET_KEY), false);
});

test("listing submission is verified and reaches the Sheets receiver", async () => {
  const r = await run(details);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.calls.length, 2);
  const forwarded = JSON.parse(r.calls[1].config.body);
  assert.equal(forwarded.form, "open-house-requests");
  assert.equal(forwarded.data.mls_numbers, "123456789");
  assert.equal(forwarded.secret, env.RELAY_SYNC_KEY);
});

test("partner and opt-in submissions use same secure backend", async () => {
  const partner = await run({
    "form-name": "partner-interest", name: "Taylor", email: "taylor@example.org",
    notes: "Hello!", "cf-turnstile-response": "test-token", submission_id: "partner-1"
  });
  assert.equal(partner.status, 200);
  assert.equal(JSON.parse(partner.calls[1].config.body).form, "partner-interest");
  const optIn = await run({
    "form-name": "open-house-updates", email: "sam@example.org", marketing_opt_in: "Yes",
    "cf-turnstile-response": "test-token", submission_id: "updates-1"
  });
  assert.equal(optIn.status, 200);
});

test("explicit consent is required for update emails", async () => {
  const r = await run({
    "form-name": "open-house-updates", email: "sam@example.org",
    "cf-turnstile-response": "test-token"
  });
  assert.equal(r.status, 400);
  assert.equal(r.calls.length, 0);
});

test("missing keys disable submissions rather than silently accepting them", async () => {
  const r = await run(details, { env: { ...env, RELAY_SYNC_KEY: "" } });
  assert.equal(r.status, 503);
  assert.equal(r.calls.length, 0);
});

test("invalid Turnstile verification blocks forwarding", async () => {
  const r = await run(details, { verify: false });
  assert.equal(r.status, 403);
  assert.equal(r.calls.length, 1);
});

test("a Turnstile challenge from a different hostname is rejected", async () => {
  const r = await run(details, { hostname: "attacker.invalid" });
  assert.equal(r.status, 403);
  assert.equal(r.calls.length, 1);
});

test("receiver failures are not displayed as successes", async () => {
  const r = await run(details, { receiver: false });
  assert.equal(r.status, 502);
  assert.equal(r.body.ok, false);
});

test("migration HTML has no remaining Netlify form handler", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(html.includes("data-netlify="), false);
  assert.equal(html.includes("action=\"/api/submit\""), true);
  assert.equal(html.includes("relayGate.post(form,body)"), true);
});
