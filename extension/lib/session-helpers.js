// Pure session helpers shared by the popup and the background service worker.
// Classic script (no exports), published on globalThis like the other helpers.

// A timed session is over once its expectedEndTime has passed. Open-ended
// sessions (no expectedEndTime) never expire on their own.
const isSessionExpired = (session, now = Date.now()) => {
  if (!session || !session.expectedEndTime) return false;
  const end = new Date(session.expectedEndTime).getTime();
  return Number.isFinite(end) && end <= now;
};

// The user's active session from a GET /api/sessions response, or null.
const findActiveSession = (sessions) =>
  (Array.isArray(sessions) ? sessions.find((s) => s && s.isActive === true) : null) ?? null;

globalThis.fpSessionHelpers = { isSessionExpired, findActiveSession };
