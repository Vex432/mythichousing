/*
 * Open House Relay — Cloudflare Pages form receiver.
 * No third-party form service or paid database required.
 * All three forms forward to the owner's secured Google Apps Script.
 * Never log form contents or expose RELAY_SYNC_KEY to browsers.
 */
const FORM_FIELDS = {
  "open-house-requests": {
    request_id: 90, contact_name: 100, email: 180, phone: 35,
    mls_numbers: 1300, mls_area: 90, other_mls_region: 100,
    property_type: 50, listing_stage: 50, property_condition: 80,
    submission_source: 50, partner_token: 80, review_flags: 400,
    readiness_vacant: 5, readiness_cleaned: 5, readiness_maintained: 5,
    readiness_ready_to_show: 5, safety_waiver: 5, safety_rough_conditions: 5,
    safety_occupied: 5, safety_pets: 5, safety_access: 5, safety_utilities: 5,
    cat_status: 80, access_quirks: 500, notes: 1200
  },
  "partner-interest": {
    submission_id: 90, name: 90, email: 180, phone: 35,
    notes: 1000, marketing_opt_in: 5
  },
  "open-house-updates": {
    submission_id: 90, name: 90, email: 180, marketing_opt_in: 5
  }
};

function respond(status, ok, error) {
  return new Response(JSON.stringify(error ? { ok, error } : { ok }), {
    status, headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
const tidy = (value, max) => String(value || "")
  .replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function onRequestPost({ request, env }) {
  if (!env.RELAY_APPS_SCRIPT_URL || !env.RELAY_SYNC_KEY ||
      !env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY) {
    return respond(503, false, "Submissions are temporarily unavailable. Please contact us directly.");
  }
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[-_a-zA-Z0-9]+\/exec$/.test(env.RELAY_APPS_SCRIPT_URL)) {
    return respond(503, false, "The submission service is not configured.");
  }
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    return respond(403, false, "Cross-site submissions are not accepted.");
  }
  const type = request.headers.get("Content-Type") || "";
  if (!type.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return respond(415, false, "Unsupported submission format.");
  }
  const claimedLength = Number(request.headers.get("Content-Length") || 0);
  if (claimedLength > 32000) return respond(413, false, "Submission too large.");
  let raw;
  try { raw = await request.text(); }
  catch { return respond(400, false, "Unable to read the submission."); }
  if (raw.length > 32000) return respond(413, false, "Submission too large.");
  const fields = new URLSearchParams(raw);
  const form = tidy(fields.get("form-name"), 90);
  if (!Object.prototype.hasOwnProperty.call(FORM_FIELDS, form)) {
    return respond(400, false, "Unknown form.");
  }
  // Honeypot: silently acknowledge likely automated traffic, without forwarding it.
  if (fields.get("website")) return respond(200, true);
  const data = {};
  for (const [key, max] of Object.entries(FORM_FIELDS[form])) {
    data[key] = tidy(fields.get(key), max);
  }
  if (!validEmail(data.email)) return respond(400, false, "Please enter a valid email.");
  if (form === "open-house-requests") {
    const numbers = data.mls_numbers.split(/[\s,;]+/).filter(Boolean);
    if (!data.contact_name || !data.phone || !data.mls_area ||
        numbers.length < 1 || numbers.length > 25) {
      return respond(400, false, "Please include contact details, MLS area and 1–25 listings.");
    }
  } else if (form === "partner-interest" && !data.name) {
    return respond(400, false, "Please enter your name.");
  } else if (form === "open-house-updates" && data.marketing_opt_in !== "Yes") {
    return respond(400, false, "Please confirm your email opt-in.");
  }

  const token = tidy(fields.get("cf-turnstile-response"), 2048);
  if (!token) return respond(400, false, "Complete the verification check and try again.");
  let verified;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: request.headers.get("CF-Connecting-IP") || ""
      }),
      signal: AbortSignal.timeout(10000)
    });
    verified = response.ok && await response.json();
  } catch {
    return respond(502, false, "Verification is unavailable. Please try again.");
  }
  if (!verified?.success || verified.hostname !== new URL(request.url).hostname) {
    return respond(403, false, "Verification failed or expired. Please try again.");
  }

  try {
    const result = await fetch(env.RELAY_APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      redirect: "follow",
      body: JSON.stringify({
        secret: env.RELAY_SYNC_KEY,
        form,
        received_at: new Date().toISOString(),
        data
      }),
      signal: AbortSignal.timeout(25000)
    });
    if (!result.ok) throw new Error("Upstream returned " + result.status);
    const body = await result.json();
    if (!body?.ok) throw new Error("Receiver rejected submission");
    return respond(200, true);
  } catch (err) {
    console.error("[relay-cloudflare] Could not confirm Google Sheets receipt:", String(err?.message || "Unknown").slice(0, 120));
    return respond(502, false, "We couldn't confirm the submission. Your entries are still here; please retry or contact us.");
  }
}
