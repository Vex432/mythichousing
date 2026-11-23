/*
 * Only the Turnstile SITE key is public. Never return the secret or Apps Script URL.
 * Forms remain disabled until all required server-side values are configured.
 */
export function onRequestGet({ env }) {
  const ready = Boolean(
    env.TURNSTILE_SITE_KEY &&
    env.TURNSTILE_SECRET_KEY &&
    env.RELAY_APPS_SCRIPT_URL &&
    env.RELAY_SYNC_KEY
  );
  return new Response(JSON.stringify({
    ready,
    turnstileSiteKey: ready ? String(env.TURNSTILE_SITE_KEY) : ""
  }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
