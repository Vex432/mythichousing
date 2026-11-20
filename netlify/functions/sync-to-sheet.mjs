/*
 * Open House Relay: private Netlify Forms -> Google Sheets bridge.
 * Triggered by Netlify's signed formSubmitted platform event, never a public endpoint.
 * The Apps Script URL and shared key belong in Netlify environment variables
 * (Functions scope). Until configured, existing Netlify submissions still work.
 */
const asText = (v, max = 1200) =>
  typeof v === "string" ? v.trim().slice(0, max) : v == null ? "" : String(v).slice(0, max);

export default {
  async formSubmitted(event) {
    const d = event?.data;
    if (!d || typeof d !== "object") return;
    const formName = asText(d["form-name"] || d.form_name || d.formName, 90);
    if (formName && formName !== "open-house-requests") return;
    if (!asText(d.mls_numbers, 1300)) return;

    const appScriptUrl = Netlify.env.get("RELAY_APPS_SCRIPT_URL");
    const syncKey = Netlify.env.get("RELAY_SYNC_KEY");
    if (!appScriptUrl || !syncKey) {
      console.warn("[relay-sync] Waiting for Apps Script URL and key; Netlify retains submission.");
      return;
    }
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[-_a-zA-Z0-9]+\/exec$/.test(appScriptUrl)) {
      throw new Error("[relay-sync] Invalid Apps Script deployment URL.");
    }
    const fields = [
      "request_id", "mls_numbers", "mls_area", "other_mls_region",
      "property_type", "listing_stage", "property_condition",
      "contact_name", "email", "phone", "submission_source", "partner_token",
      "review_flags", "readiness_vacant", "readiness_cleaned", "readiness_maintained",
      "readiness_ready_to_show", "safety_waiver", "safety_rough_conditions",
      "safety_occupied", "safety_pets", "safety_access", "safety_utilities",
      "cat_status", "access_quirks", "notes"
    ];
    const safeData = {};
    for (const name of fields) safeData[name] = asText(d[name], name === "mls_numbers" ? 1300 : name === "notes" ? 1200 : 500);
    const res = await fetch(appScriptUrl, {
      method: "POST",
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: JSON.stringify({ secret: syncKey, form: "open-house-requests", received_at: new Date().toISOString(), data: safeData }),
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error("[relay-sync] Apps Script HTTP error " + res.status);
    let result;
    try { result = await res.json(); }
    catch { throw new Error("[relay-sync] Apps Script returned an invalid response. Check deployment access."); }
    if (!result?.ok) throw new Error("[relay-sync] Apps Script rejected request: " + asText(result?.error, 160));
    console.info("[relay-sync] Synced listing rows:", Number(result.rows || 0));
  }
};