/* Events page: pull the live event list from the Google Sheet (via Apps Script)
 * and render one card per upcoming event. Falls back to DEMO_EVENTS for local
 * preview when APPS_SCRIPT_URL is blank. */
(function () {
  var cfg = window.GHC_CONFIG || {};
  var grid = document.getElementById('events-grid');
  var status = document.getElementById('events-status');
  if (!grid) return;

  function spotsLevel(count, capacity) {
    if (!capacity || capacity <= 0) return 'low';
    if (count >= capacity) return 'full';
    var pct = count / capacity;
    if (pct >= 0.85) return 'high';
    if (pct >= 0.6) return 'mid';
    return 'low';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderCard(ev) {
    var cap = Number(ev.capacity) || 0;
    var count = Number(ev.count) || 0;
    var pct = cap ? Math.min(100, Math.round((count / cap) * 100)) : 0;
    var level = spotsLevel(count, cap);
    var full = level === 'full';
    var spotsText = full ? 'Sold out' : (cap ? (count + ' of ' + cap + ' spots') : '');

    var meta = esc(ev.date || '');
    if (ev.time) meta += ' · ' + esc(ev.time);
    if (ev.location) meta += ' · ' + esc(ev.location);

    var barHtml = cap ? (
      '<div class="spots spots--' + level + '">' +
        '<div class="spots-bar"><div class="spots-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="spots-label">' + esc(spotsText) + '</div>' +
      '</div>'
    ) : '';

    return '' +
      '<a class="event-card" href="rsvp.html?event=' + encodeURIComponent(ev.id) + '">' +
        (ev.category ? '<span class="event-cat">' + esc(ev.category) + '</span>' : '') +
        '<h3 class="event-name">' + esc(ev.name) + '</h3>' +
        '<div class="event-meta">' + meta + '</div>' +
        (ev.blurb ? '<p class="event-blurb">' + esc(ev.blurb) + '</p>' : '') +
        barHtml +
        '<span class="event-cta">' + (full ? 'Join the waitlist' : 'RSVP') + ' &rarr;</span>' +
      '</a>';
  }

  function render(events) {
    if (!events || !events.length) {
      grid.innerHTML = '';
      if (status) {
        status.hidden = false;
        status.textContent = 'No events on the calendar right now — check back soon.';
      }
      return;
    }
    if (status) status.hidden = true;
    grid.innerHTML = events.map(renderCard).join('');
  }

  function showError() {
    grid.innerHTML = '';
    if (status) {
      status.hidden = false;
      status.textContent = 'Having trouble loading events. Please refresh in a moment.';
    }
  }

  // Loading skeleton
  grid.innerHTML = '<div class="event-card skeleton"></div>'.repeat(3);

  if (!cfg.APPS_SCRIPT_URL) {
    // Local preview mode
    render(cfg.DEMO_EVENTS || []);
    return;
  }

  fetch(cfg.APPS_SCRIPT_URL + '?action=events')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      render(data.events || data || []);
    })
    .catch(showError);
})();
