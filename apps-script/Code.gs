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
