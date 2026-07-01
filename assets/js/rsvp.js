/* RSVP page: read ?event=<id>, show the event + a color-coded capacity bar,
 * collect Name / Email / Location, and post the RSVP to the Google Sheet.
 * Offers optional Venmo prepay. Falls back to DEMO_EVENTS for local preview. */
(function () {
  var cfg = window.GHC_CONFIG || {};

  var els = {
    loading: document.getElementById('rsvp-loading'),
    content: document.getElementById('rsvp-content'),
    missing: document.getElementById('rsvp-missing'),
    cat: document.getElementById('ev-cat'),
    name: document.getElementById('ev-name'),
    meta: document.getElementById('ev-meta'),
    blurb: document.getElementById('ev-blurb'),
    spots: document.getElementById('ev-spots'),
    spotsBar: document.getElementById('ev-spots-fill'),
    spotsLabel: document.getElementById('ev-spots-label'),
    spotsHint: document.getElementById('ev-spots-hint'),
    form: document.getElementById('rsvp-form'),
    formStatus: document.getElementById('form-status'),
    submit: document.getElementById('rsvp-submit'),
    thanks: document.getElementById('rsvp-thanks'),
    venmo: document.getElementById('venmo-prepay'),
    venmoBtn: document.getElementById('venmo-btn')
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function getParam(k) {
    return new URLSearchParams(window.location.search).get(k);
  }

  function spotsLevel(count, capacity) {
    if (!capacity || capacity <= 0) return 'low';
    if (count >= capacity) return 'full';
    var pct = count / capacity;
    if (pct >= 0.85) return 'high';
    if (pct >= 0.6) return 'mid';
    return 'low';
  }

  var current = null; // holds the active event

  function paintSpots(count, capacity) {
    if (!els.spots) return;
    var cap = Number(capacity) || 0;
    count = Number(count) || 0;
    if (!cap) { els.spots.hidden = true; return; }
    els.spots.hidden = false;

    var level = spotsLevel(count, cap);
    var pct = Math.min(100, Math.round((count / cap) * 100));
    els.spots.className = 'spots spots--' + level;
    els.spotsBar.style.width = pct + '%';

    if (level === 'full') {
      els.spotsLabel.textContent = 'Sold out';
      els.spotsHint.textContent = 'This one filled up — RSVP to join the waitlist.';
    } else {
      els.spotsLabel.textContent = count + ' of ' + cap + ' spots taken';
      els.spotsHint.textContent = 'Tell your friends before it sells out.';
    }
  }

  function venmoLink(price, eventName) {
    var handle = cfg.VENMO_HANDLE;
    if (!handle) return null;
    var url = 'https://venmo.com/' + encodeURIComponent(handle) + '?txn=pay';
    if (price) url += '&amount=' + encodeURIComponent(price);
    url += '&note=' + encodeURIComponent('Griffin Hall Coffee — ' + (eventName || 'event'));
    return url;
  }

  function renderEvent(ev) {
    current = ev;
    if (els.cat) {
      if (ev.category) { els.cat.textContent = ev.category; els.cat.hidden = false; }
      else els.cat.hidden = true;
    }
    els.name.textContent = ev.name || 'RSVP';
    document.title = (ev.name ? ev.name + ' — ' : '') + 'RSVP · Griffin Hall Coffee';

    var meta = ev.date || '';
    if (ev.time) meta += ' · ' + ev.time;
    if (ev.location) meta += ' · ' + ev.location;
    els.meta.textContent = meta;

    if (els.blurb) {
      if (ev.blurb) { els.blurb.textContent = ev.blurb; els.blurb.hidden = false; }
      else els.blurb.hidden = true;
    }

    paintSpots(ev.count, ev.capacity);

    // Venmo prepay (optional)
    var link = venmoLink(ev.price, ev.name);
    if (link && els.venmo && els.venmoBtn) {
      els.venmo.hidden = false;
      els.venmoBtn.href = link;
      els.venmoBtn.textContent = ev.price
        ? ('Pay ahead · $' + esc(ev.price) + ' via Venmo')
        : 'Pay ahead via Venmo';
    }

    if (els.loading) els.loading.hidden = true;
    if (els.content) els.content.hidden = false;
  }

  function showMissing() {
    if (els.loading) els.loading.hidden = true;
    if (els.missing) els.missing.hidden = false;
  }

  function loadEvent(id) {
    if (!cfg.APPS_SCRIPT_URL) {
      var demo = (cfg.DEMO_EVENTS || []).filter(function (e) {
        return String(e.id) === String(id);
      })[0];
      if (demo) renderEvent(demo); else showMissing();
      return;
    }
    fetch(cfg.APPS_SCRIPT_URL + '?action=event&id=' + encodeURIComponent(id))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var ev = data.event || data;
        if (ev && ev.name) renderEvent(ev); else showMissing();
      })
      .catch(showMissing);
  }

  // ---- Form submit ----
  function setStatus(msg, kind) {
    if (!els.formStatus) return;
    els.formStatus.textContent = msg || '';
    els.formStatus.className = 'form-status' + (kind ? ' ' + kind : '');
  }

  if (els.form) {
    els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!current) return;

      var data = {
        id: current.id,
        name: document.getElementById('f-name').value.trim(),
        email: document.getElementById('f-email').value.trim(),
        location: document.getElementById('f-location').value.trim()
      };
      if (!data.name || !data.email || !data.location) {
        setStatus('Please fill in your name, email, and location.', 'error');
        return;
      }

      els.submit.disabled = true;
      setStatus('Saving your spot…', '');

      // Local preview (no backend): simulate success
      if (!cfg.APPS_SCRIPT_URL) {
        setTimeout(function () {
          current.count = (Number(current.count) || 0) + 1;
          paintSpots(current.count, current.capacity);
          els.form.hidden = true;
          if (els.thanks) els.thanks.hidden = false;
        }, 500);
        return;
      }

      fetch(cfg.APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify(data) })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.ok) {
            if (typeof res.count !== 'undefined') paintSpots(res.count, res.capacity || current.capacity);
            els.form.hidden = true;
            if (els.thanks) els.thanks.hidden = false;
          } else if (res.error === 'duplicate') {
            setStatus("You're already on the list for this one — see you there!", 'error');
            els.submit.disabled = false;
          } else if (res.error === 'full') {
            setStatus('This event just sold out. Reach out and we\'ll add you to the waitlist.', 'error');
            els.submit.disabled = false;
          } else {
            setStatus('Something went wrong. Please try again.', 'error');
            els.submit.disabled = false;
          }
        })
        .catch(function () {
          setStatus('Network hiccup — please try again.', 'error');
          els.submit.disabled = false;
        });
    });
  }

  // ---- Init ----
  var id = getParam('event');
  if (!id) { showMissing(); return; }
  loadEvent(id);
})();
