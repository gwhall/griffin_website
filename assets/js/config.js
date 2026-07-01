/* Griffin Hall Coffee — site configuration
 * Single source of truth for the backend URL, payment + social links.
 *
 * ▸ After you deploy apps-script/Code.gs as a Web App, paste its /exec URL
 *   into APPS_SCRIPT_URL below. Until then, the site runs on DEMO_EVENTS so
 *   you can preview the design locally.
 */
window.GHC_CONFIG = {
  // Paste your deployed Apps Script Web App URL here (ends in /exec).
  // Leave blank to preview with the demo events below.
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbznb5oVvlSW3yTodQKtW3XGEd9lgE1vDIo71pCwo_empCmokXDkhxCjBEsNmD3z4fmf/exec',

  // Venmo username people can pay ahead with (optional — cash/Venmo also fine day-of).
  VENMO_HANDLE: 'griffinhallcoffee',

  CONTACT_EMAIL: 'griffinhallconsulting@gmail.com',

  SOCIAL: {
    Instagram: 'https://instagram.com/griffin.fleur',
    YouTube: 'https://youtube.com/@griffinhallcoffee',
    LinkedIn: 'https://www.linkedin.com/in/griffin-hall-8b1657148/'
  },

  /* Demo data used only when APPS_SCRIPT_URL is blank (local preview).
   * The live site pulls the real list straight from the Google Sheet. */
  DEMO_EVENTS: [
    {
      id: 1,
      name: 'Palate Development & Cupping',
      date: 'Sat, Jul 12',
      time: '10:00 AM',
      location: 'Portland, OR',
      category: 'Cupping',
      blurb: 'Slow down and taste with intention. A guided cupping to sharpen your palate and vocabulary — sweetness, acidity, body, and the subtle in-between.',
      capacity: 20,
      count: 8,
      price: '25'
    },
    {
      id: 2,
      name: 'Brewing Guidance',
      date: 'Sat, Jul 19',
      time: '11:00 AM',
      location: 'Portland, OR',
      category: 'Brewing',
      blurb: 'Dial in your ritual at home. Grind, ratio, water, and technique — hands-on guidance to make the cup you actually want, every morning.',
      capacity: 16,
      count: 3,
      price: '25'
    },
    {
      id: 3,
      name: 'Supply Chain & Industry Perspective',
      date: 'Sat, Jul 26',
      time: '2:00 PM',
      location: 'Portland, OR',
      category: 'Speaking',
      blurb: 'From origin to cup. An honest look at how coffee moves through the world — the people, the economics, and where connection gets lost and found.',
      capacity: 30,
      count: 22,
      price: ''
    }
  ]
};
