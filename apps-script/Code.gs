/****************************************************************
 * Griffin Hall Coffee — RSVP + Events backend (Google Apps Script)
 *
 * This script is BOUND to the events spreadsheet:
 *   https://docs.google.com/spreadsheets/d/12zMTrRJJlot2iBu9Yo3RIk5bECUkFnEi2hcwy_4ZqF4/edit
 * (Open that sheet → Extensions ▸ Apps Script → paste this in.)
 *
 * HOW GRIFFIN MANAGES EVENTS (no code needed):
 *   Edit the "Events" tab. One row = one event. Columns (row 1 = headers):
 *     #  |  Name  |  Date  |  Time  |  Location  |  Category  |  Blurb  |  Capacity  |  Price
 *   - #        : a number (1, 2, 3 …). Keep it stable per event.
 *   - Date     : a real date (e.g. 2026-07-12). Past events auto-hide from the site.
 *   - Capacity : max attendees (drives the "spots" bar). Blank = 20.
 *   - Price    : optional; shown next to the Venmo prepay button.
 *   RSVPs for each event land in their own tab named "<#> — <Name>", created automatically.
 *
 * DEPLOY: Deploy ▸ New deployment ▸ Web app ▸ Execute as: Me ▸ Who has access: Anyone.
 *   Copy the /exec URL and paste it into assets/js/config.js (APPS_SCRIPT_URL).
 ****************************************************************/

var EVENTS_SHEET = 'Events';
var DEFAULT_CAPACITY = 20;

/* --- Confirmation email (sent via Resend when someone RSVPs) ---
 * The Resend API key is read from Script Properties, NOT stored in this file,
 * so it never ends up in the public repo. To set it up (one time):
 *   Apps Script editor ▸ Project Settings (gear) ▸ Script properties ▸ Add property
 *     Property: RESEND_API_KEY    Value: re_...your key...
 * Until that property exists, RSVPs still record fine — they just skip the email.
 * Replies to the confirmation go to REPLY_TO (Griffin's real inbox). */
var FROM_EMAIL    = 'Griffin Hall Coffee <rsvp@griffin.coffee>';
var REPLY_TO      = 'griffinhallconsulting@gmail.com';
var SITE_URL      = 'https://griffin.coffee';
var VENMO_HANDLE  = 'griffinhallcoffee';

/* ---------- HTTP handlers ---------- */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'events';
  if (action === 'event') {
    var ev = getEventById_((e.parameter.id || '').toString());
    return json_(ev ? { event: publicEvent_(ev, true) } : { error: 'not_found' });
  }
  // default: list of upcoming events
  var events = getUpcomingEvents_().map(function (ev) { return publicEvent_(ev, true); });
  return json_({ events: events });
}

function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'bad_request' }); }

  var name = trim_(data.name);
  var email = trim_(data.email);
  var location = trim_(data.location);
  if (!name || !email || !location) return json_({ ok: false, error: 'missing_fields' });

  var ev = getEventById_((data.id || '').toString());
  if (!ev) return json_({ ok: false, error: 'not_found' });
  if (isPast_(ev.dateObj)) return json_({ ok: false, error: 'not_found' });

  var sheet = getOrCreateRsvpSheet_(ev);
  var rows = sheet.getLastRow() - 1; // minus header
  var existing = rows > 0 ? sheet.getRange(2, 1, rows, 4).getValues() : [];

  // Duplicate email guard (within this event)
  var lower = email.toLowerCase();
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i][2]).trim().toLowerCase() === lower) {
      return json_({ ok: false, error: 'duplicate' });
    }
  }

  // Capacity guard
  var count = existing.length;
  if (count >= ev.capacity) {
    return json_({ ok: false, error: 'full', count: count, capacity: ev.capacity });
  }

  var stamp = Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd HH:mm:ss");
  sheet.appendRow([stamp, name, email, location]);

  // Send the confirmation email, but never let an email hiccup fail the RSVP.
  try { sendConfirmationEmail_(ev, name, email); } catch (mailErr) {}

  return json_({ ok: true, count: count + 1, capacity: ev.capacity });
}

/* ---------- Events tab reading ---------- */

function getEventsSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(EVENTS_SHEET);
  if (!sh) throw new Error('Missing "' + EVENTS_SHEET + '" tab.');
  return sh;
}

// Read + normalize all rows of the Events tab into objects.
function getAllEvents_() {
  var sh = getEventsSheet_();
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  function col(names) {
    for (var n = 0; n < names.length; n++) {
      var idx = headers.indexOf(names[n]);
      if (idx !== -1) return idx;
    }
    return -1;
  }
  var ci = {
    id: col(['#', 'id', 'event id', 'number']),
    name: col(['name', 'event', 'title']),
    date: col(['date']),
    time: col(['time']),
    location: col(['location', 'city']),
    category: col(['category', 'type']),
    blurb: col(['blurb', 'description', 'about']),
    capacity: col(['capacity', 'max', 'spots']),
    price: col(['price', 'cost'])
  };

  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var name = ci.name > -1 ? String(row[ci.name]).trim() : '';
    var id = ci.id > -1 ? String(row[ci.id]).trim() : '';
    if (!name && !id) continue; // skip blank rows

    var dateVal = ci.date > -1 ? row[ci.date] : '';
    var dateObj = parseDate_(dateVal);
    var cap = ci.capacity > -1 ? parseInt(row[ci.capacity], 10) : NaN;

    out.push({
      id: id,
      name: name,
      dateObj: dateObj,
      dateDisplay: dateObj ? Utilities.formatDate(dateObj, tz_(), 'EEE, MMM d') : String(dateVal || '').trim(),
      time: ci.time > -1 ? formatTime_(row[ci.time]) : '',
      location: ci.location > -1 ? String(row[ci.location]).trim() : '',
      category: ci.category > -1 ? String(row[ci.category]).trim() : '',
      blurb: ci.blurb > -1 ? String(row[ci.blurb]).trim() : '',
      capacity: (!isNaN(cap) && cap > 0) ? cap : DEFAULT_CAPACITY,
      price: ci.price > -1 ? String(row[ci.price]).trim() : ''
    });
  }
  return out;
}

function getUpcomingEvents_() {
  var all = getAllEvents_().filter(function (ev) { return !isPast_(ev.dateObj); });
  all.sort(function (a, b) {
    var av = a.dateObj ? a.dateObj.getTime() : Infinity; // undated → last
    var bv = b.dateObj ? b.dateObj.getTime() : Infinity;
    return av - bv;
  });
  return all;
}

function getEventById_(id) {
  id = String(id).trim();
  var all = getAllEvents_();
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].id).trim() === id) return all[i];
  }
  return null;
}

// Shape an event for the website, optionally including live RSVP count.
function publicEvent_(ev, withCount) {
  return {
    id: ev.id,
    name: ev.name,
    date: ev.dateDisplay,
    time: ev.time,
    location: ev.location,
    category: ev.category,
    blurb: ev.blurb,
    capacity: ev.capacity,
    price: ev.price,
    count: withCount ? countRsvps_(ev) : undefined
  };
}

/* ---------- Per-event RSVP tabs ---------- */

function rsvpSheetName_(ev) {
  var raw = (ev.id ? ev.id + ' — ' : '') + ev.name;
  // Sheet names can't contain: \ / ? * [ ] : and max 100 chars
  return raw.replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 95).trim();
}

function getOrCreateRsvpSheet_(ev) {
  var ss = SpreadsheetApp.getActive();
  var nm = rsvpSheetName_(ev);
  var sh = ss.getSheetByName(nm);
  if (!sh) {
    sh = ss.insertSheet(nm);
    sh.appendRow(['Timestamp', 'Name', 'Email', 'Location']);
    sh.getRange(1, 1, 1, 4).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function countRsvps_(ev) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(rsvpSheetName_(ev));
  if (!sh) return 0;
  return Math.max(0, sh.getLastRow() - 1);
}

/* ---------- helpers ---------- */

function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || 'America/Los_Angeles'; }

function trim_(s) { return String(s == null ? '' : s).trim(); }

// A Time-formatted cell comes back as a Date (epoch 1899); format it as "10:00 AM".
// Plain text (e.g. "10:00 AM") passes through untouched.
function formatTime_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, tz_(), 'h:mm a');
  }
  return String(v == null ? '' : v).trim();
}

function parseDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  var s = String(v || '').trim();
  if (!s) return null;
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// True if the event date is before today (compared at day granularity, sheet TZ).
function isPast_(dateObj) {
  if (!dateObj) return false; // undated events stay visible
  var today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  var evDay = Utilities.formatDate(dateObj, tz_(), 'yyyy-MM-dd');
  return evDay < today;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Confirmation email ---------- */

function sendConfirmationEmail_(ev, name, toEmail) {
  var key = PropertiesService.getScriptProperties().getProperty('RESEND_API_KEY');
  if (!key) return; // not configured yet — record the RSVP, skip the email

  var payload = {
    from: FROM_EMAIL,
    to: [toEmail],
    reply_to: REPLY_TO,
    subject: "You're in — " + ev.name,
    html: rsvpEmailHtml_(ev, name)
  };

  UrlFetchApp.fetch('https://api.resend.com/emails', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

/* ---------- One-off diagnostic (safe to delete later) ----------
 * In the editor: choose "sendTestEmail" in the top toolbar, click Run.
 * The FIRST run prompts you to authorize external requests — click Allow.
 * Then open View ▸ Executions (or the Execution log) to read the result. */
function sendTestEmail() {
  var key = PropertiesService.getScriptProperties().getProperty('RESEND_API_KEY');
  if (!key) {
    Logger.log('RESEND_API_KEY is NOT set. Add it in Project Settings (gear) > Script properties.');
    return;
  }
  Logger.log('RESEND_API_KEY found (starts with ' + key.slice(0, 6) + '...)');
  var ev = getEventById_('1') ||
    { name: 'Test Event', dateDisplay: 'Soon', time: '', location: '', category: 'Test', blurb: '', price: '25' };
  var resp = UrlFetchApp.fetch('https://api.resend.com/emails', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify({
      from: FROM_EMAIL, to: ['stefanturkowski@gmail.com'], reply_to: REPLY_TO,
      subject: 'Test — Griffin Hall Coffee email pipeline', html: rsvpEmailHtml_(ev, 'Test')
    }),
    muteHttpExceptions: true
  });
  Logger.log('Resend responded: ' + resp.getResponseCode() + ' ' + resp.getContentText());
}

// Warm, on-brand HTML email (inline styles + tables for email-client compatibility).
function rsvpEmailHtml_(ev, name) {
  var rows =
    detailRow_('Date', ev.dateDisplay) +
    detailRow_('Time', ev.time) +
    detailRow_('Location', ev.location) +
    detailRow_('Price', ev.price ? '$' + ev.price : '');

  var cat = ev.category
    ? '<div style="font:600 11px/1 Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#A6764B;margin-bottom:8px;">' + escapeHtml_(ev.category) + '</div>'
    : '';

  var blurb = ev.blurb
    ? '<p style="margin:14px 0 0;font:italic 400 15px/1.6 Georgia,serif;color:#5b4a3c;">' + escapeHtml_(ev.blurb) + '</p>'
    : '';

  var hi = name ? ', ' + escapeHtml_(firstName_(name)) : '';
  var amt = ev.price ? ' $' + escapeHtml_(ev.price) : '';
  var venmoUrl = venmoLink_(ev.price, ev.name);

  return '' +
'<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
'<body style="margin:0;padding:0;background:#F5EFE3;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE3;">' +
'<tr><td align="center" style="padding:32px 16px;">' +
  '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;background:#FBF7EF;border:1px solid rgba(59,42,32,0.14);border-radius:16px;">' +
    // header wordmark
    '<tr><td style="padding:26px 32px 18px;text-align:center;border-bottom:1px solid rgba(59,42,32,0.10);">' +
      '<div style="font:600 21px/1 Georgia,serif;color:#2E241C;letter-spacing:-0.01em;">Griffin Hall</div>' +
      '<div style="margin-top:6px;font:600 11px/1 Arial,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#A6764B;">Coffee</div>' +
    '</td></tr>' +
    // greeting
    '<tr><td style="padding:30px 32px 6px;">' +
      '<h1 style="margin:0;font:500 26px/1.2 Georgia,serif;color:#2E241C;">You\'re in' + hi + '</h1>' +
      '<p style="margin:10px 0 22px;font:400 15px/1.6 Arial,sans-serif;color:#5b4a3c;">Your spot is saved. Here\'s what you signed up for.</p>' +
      // event detail card
      '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F5EFE3;border:1px solid rgba(59,42,32,0.14);border-radius:12px;">' +
        '<tr><td style="padding:20px 22px;">' +
          cat +
          '<div style="font:500 20px/1.25 Georgia,serif;color:#2E241C;margin-bottom:14px;">' + escapeHtml_(ev.name) + '</div>' +
          '<table role="presentation" cellpadding="0" cellspacing="0" width="100%">' + rows + '</table>' +
          blurb +
        '</td></tr>' +
      '</table>' +
    '</td></tr>' +
    // Venmo prepay reminder
    '<tr><td style="padding:20px 32px 0;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F1E4D3;border:1px solid rgba(166,118,75,0.42);border-radius:12px;">' +
        '<tr><td style="padding:18px 22px;text-align:center;">' +
          '<p style="margin:0 0 14px;font:400 15px/1.6 Arial,sans-serif;color:#2E241C;">Please Venmo Griffin' + amt + ' before the event to lock in your spot</p>' +
          '<a href="' + venmoUrl + '" style="display:inline-block;background:#A6764B;color:#FBF7EF;font:600 13px/1 Arial,sans-serif;text-decoration:none;padding:12px 22px;border-radius:999px;">Pay via Venmo &middot; @' + VENMO_HANDLE + '</a>' +
        '</td></tr>' +
      '</table>' +
    '</td></tr>' +
    // CTA
    '<tr><td style="padding:22px 32px 6px;text-align:center;">' +
      '<a href="' + SITE_URL + '" style="display:inline-block;background:#3B2A20;color:#FBF7EF;font:600 14px/1 Arial,sans-serif;text-decoration:none;padding:14px 28px;border-radius:999px;">See all events &rarr;</a>' +
    '</td></tr>' +
    // reply note
    '<tr><td style="padding:22px 32px 0;">' +
      '<p style="margin:0;font:400 14px/1.6 Arial,sans-serif;color:#5b4a3c;">Need to cancel or change something? Just <b>reply to this email</b> — it goes straight to Griffin.</p>' +
    '</td></tr>' +
    // footer
    '<tr><td style="padding:24px 32px 28px;text-align:center;">' +
      '<div style="border-top:1px solid rgba(59,42,32,0.10);padding-top:18px;font:400 12px/1.6 Arial,sans-serif;color:#9c8c78;">' +
        'Griffin Hall Coffee &middot; <a href="' + SITE_URL + '" style="color:#A6764B;text-decoration:none;">griffin.coffee</a>' +
      '</div>' +
    '</td></tr>' +
  '</table>' +
'</td></tr></table></body></html>';
}

function detailRow_(label, value) {
  if (!value) return '';
  return '<tr>' +
    '<td style="padding:5px 0;font:600 11px/1.5 Arial,sans-serif;letter-spacing:.10em;text-transform:uppercase;color:#A6764B;width:92px;vertical-align:top;">' + label + '</td>' +
    '<td style="padding:5px 0;font:400 15px/1.5 Georgia,serif;color:#2E241C;">' + escapeHtml_(value) + '</td>' +
  '</tr>';
}

// Venmo deep link, matching the site's prepay button (prefills amount + note).
function venmoLink_(price, eventName) {
  var url = 'https://venmo.com/' + encodeURIComponent(VENMO_HANDLE) + '?txn=pay';
  if (price) url += '&amount=' + encodeURIComponent(price);
  url += '&note=' + encodeURIComponent('Griffin Hall Coffee — ' + (eventName || 'event'));
  return url;
}

function firstName_(s) { return String(s == null ? '' : s).trim().split(/\s+/)[0]; }

function escapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
