/**
 * Open House Relay — Google Apps Script receiver
 *
 * Install in the private Operations Tracker:
 *  1. Extensions > Apps Script; replace Code.gs with this file.
 *  2. Save, select authorizeRelay, click Run, and approve Google permissions.
 *  3. Deploy > New deployment > Web app; Execute as "Me"; Access "Anyone".
 *  4. Copy the /exec web-app URL into Netlify env RELAY_APPS_SCRIPT_URL.
 *  5. In Apps Script Project Settings > Script properties, copy RELAY_SYNC_KEY
 *     into a Netlify secret env var RELAY_SYNC_KEY (Functions scope).
 *
 * IMPORTANT: The deployment is reachable by anyone, but rejects all requests
 * missing the private 64-character key. NEVER put the key in GitHub or HTML.
 * This does not verify Realtors; all imported requests start "New" and must
 * be manually checked before appointments are coordinated.
 */
function authorizeRelay() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet || !spreadsheet.getSheetByName("Request Queue"))
    throw new Error("Open this script from the Open House Relay tracker via Extensions > Apps Script.");
  const props = PropertiesService.getScriptProperties();
  props.setProperty("RELAY_SHEET_ID", spreadsheet.getId());
  if (!props.getProperty("RELAY_SYNC_KEY")) {
    const key = Utilities.getUuid().replace(/-/g,"") + Utilities.getUuid().replace(/-/g,"");
    props.setProperty("RELAY_SYNC_KEY", key);
  }
  console.log("Authorized tracker. Copy RELAY_SYNC_KEY securely from Project Settings > Script properties to Netlify. Do not share the key.");
  return "Authorization complete. Now deploy the web app.";
}

function doGet() {
  return reply_({ok:false,error:"This endpoint only accepts authorized POST requests."});
}

function doPost(e) {
  let lock;
  try {
    const body = JSON.parse(e && e.postData && e.postData.contents || "{}");
    const props = PropertiesService.getScriptProperties();
    const sharedKey = props.getProperty("RELAY_SYNC_KEY");
    if (!sharedKey || sharedKey.length < 40 || body.secret !== sharedKey)
      return reply_({ok:false,error:"Unauthorized"});
    if (body.form !== "open-house-requests")
      return reply_({ok:false,error:"Unexpected form"});
    const sheetId = props.getProperty("RELAY_SHEET_ID");
    if (!sheetId) return reply_({ok:false,error:"Run authorizeRelay first."});

    const data = body.data && typeof body.data === "object" ? body.data : {};
    const ids = String(data.mls_numbers || "").split(/[\s,;]+/).map(s=>s.trim()).filter(Boolean);
    if (!ids.length || ids.length > 25) return reply_({ok:false,error:"Expected 1–25 listings"});
    if (!trim_(data.contact_name,100) || !trim_(data.email,180))
      return reply_({ok:false,error:"Contact details missing"});

    lock = LockService.getScriptLock();
    if (!lock.tryLock(25000)) return reply_({ok:false,error:"Request queue busy"});
    const queue = SpreadsheetApp.openById(sheetId).getSheetByName("Request Queue");
    if (!queue) return reply_({ok:false,error:"Request Queue tab missing"});
    const received = new Date(body.received_at || "");
    const receivedAt = isNaN(received.getTime()) ? new Date() : received;
    const requestId = trim_(data.request_id,90) || "relay-" + Utilities.getUuid();
    const current = queue.getRange(2,1,queue.getMaxRows()-1,3).getDisplayValues();
    const existing = new Set();
    const free = [];
    current.forEach((r,i)=>{
      if (r[0] && r[2]) existing.add(r[0] + "|" + r[2].toUpperCase());
      else if (!r[0] && !r[2]) free.push(i+2);
    });
    const uniqueIds = [...new Set(ids.map(x=>x.toUpperCase()))];
    const freshIds = uniqueIds.filter(x=>!existing.has(requestId+"|"+x));
    if (freshIds.length > free.length) return reply_({ok:false,error:"Request Queue has no available rows"});

    const safetyFlags = {
      safety_waiver:"Waiver may be needed",
      safety_rough_conditions:"Rough or unfinished conditions",
      safety_occupied:"Occupied or tenant coordination",
      safety_pets:"Pets on site",
      safety_access:"Special access",
      safety_utilities:"Lighting or utilities concern"
    };
    const flagList = Object.keys(safetyFlags)
      .filter(k=>/^(yes|true|1|on)$/i.test(String(data[k]||"").trim()))
      .map(k=>safetyFlags[k]);
    const condition = trim_(data.property_condition,80);
    if (/investor|as-is|fixer/i.test(condition)) flagList.push("Investor/as-is review");
    const safetyReview = !!flagList.length;
    const notes = trim_(data.notes,500);
    const externalFlags = trim_(data.review_flags,400);
    const region = trim_(data.mls_area,90)==="Other MLS"
      ? trim_(data.other_mls_region,90)||"Other MLS" : trim_(data.mls_area,90);
    const source = trim_(data.submission_source,50)==="shared-link" ? "Shared link" : "Website";
    const reviewFlags = [
      "Verify contact identity",
      ...(safetyReview?["Safety/access review"]:[]),
      ...(externalFlags?["Submission flags: "+externalFlags]:[])
    ].join(" | ");

    freshIds.forEach((mls,i)=>{
      const row = free[i];
      const fields = [
        requestId,receivedAt,mls,region,trim_(data.property_type,50),
        trim_(data.listing_stage,50),condition,trim_(data.contact_name,100),
        trim_(data.email,180),trim_(data.phone,35),source,reviewFlags,
        "New",safetyReview?"Safety review":"Normal","",
        "","","Not yet","","",
        flagList.join(" | ")+(trim_(data.access_quirks,80)?" | See original Netlify submission for access notes":""),
        "UNVERIFIED · "+(notes||"See original Netlify submission for notes")
      ].map((v,index)=> index===1?v:asLiteral_(v));
      queue.getRange(row,1,1,22).setValues([fields]);
      queue.getRange(row,2).setNumberFormat("yyyy-mm-dd hh:mm");
      queue.getRange(row,23).setFormula(
        '=IF(OR(B'+row+'="",M'+row+'="Completed",M'+row+'="Declined"),"",MAX(0,TODAY()-B'+row+'))'
      );
    });
    SpreadsheetApp.flush();
    return reply_({ok:true,rows:freshIds.length,duplicates:uniqueIds.length-freshIds.length});
  } catch(err) {
    console.error("Relay sync failure; inspect execution details. "+String(err && err.message || "Unknown error").slice(0,180));
    return reply_({ok:false,error:"Processing failed; see Apps Script executions"});
  } finally {
    if (lock) try{lock.releaseLock()}catch(ignore){}
  }
}

function trim_(value,max) {
  return String(value==null?"":value).replace(/[\x00-\x1f\x7f]/g," ").trim().slice(0,max);
}
function asLiteral_(value) {
  const t = String(value==null?"":value);
  return /^[=+\-@]/.test(t) ? "'"+t : t;
}
function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
