// Where the extension's backend and dashboard live. Classic script (no
// exports) so popup.html can load it with a <script> tag and background.js can
// import it for its side effect. The journey test harness rewrites this one
// file to point the extension at a local backend.
globalThis.fpConfig = {
  API_BASE_URL: 'https://focalpoint-q8r5.onrender.com',
  DASHBOARD_URL: 'https://focalpoint-rho.vercel.app',
};
