// What happens when the backend rejects the extension's token (it expires
// after 7 days). Shared by background.js and the popup. Classic script (no
// exports), published on globalThis like the other lib/ files.
//
// The student is signed out, the toolbar icon shows a red "!" so they notice
// without opening the popup, and the popup opens on the login view with
// LOGIN_EXPIRED_MESSAGE. Pages are not blocked while signed out. A session
// still running on the backend is picked up again at the next sign-in.
const LOGIN_EXPIRED_MESSAGE = 'Your login expired. Sign in again.';

const markLoginExpired = async () => {
  await chrome.storage.local.remove(['token', 'activeSession']);
  await chrome.storage.local.set({ loginExpired: true });
  await chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
  await chrome.action.setBadgeText({ text: '!' });
};

// After a successful sign-in, or a deliberate sign-out
const clearLoginExpired = async () => {
  await chrome.storage.local.remove('loginExpired');
  await chrome.action.setBadgeText({ text: '' });
};

globalThis.fpLoginState = { LOGIN_EXPIRED_MESSAGE, markLoginExpired, clearLoginExpired };
