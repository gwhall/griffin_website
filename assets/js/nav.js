/* Shared chrome: mobile nav toggle, footer social links, and year stamp.
 * Runs on every page. Reads links from window.GHC_CONFIG (config.js). */
(function () {
  var cfg = window.GHC_CONFIG || {};

  // Mobile menu toggle
  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // Close menu when a link is tapped
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Footer social links from config
  var social = document.getElementById('footer-social');
  if (social && cfg.SOCIAL) {
    Object.keys(cfg.SOCIAL).forEach(function (label) {
      var a = document.createElement('a');
      a.href = cfg.SOCIAL[label];
      a.textContent = label;
      a.target = '_blank';
      a.rel = 'noopener';
      social.appendChild(a);
    });
  }

  // Current year in footer
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
