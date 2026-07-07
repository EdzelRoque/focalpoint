// Pure popup helpers. Classic script (no export statements) so popup.html
// can load it with a plain <script> tag; published on globalThis so vitest
// can import the same file. Keep this file free of fetch/chrome/DOM lookups.

// Elapsed whole seconds -> "MM:SS" under an hour, "HH:MM:SS" from one hour
// up. Negative or NaN input (clock skew, bad server timestamp) clamps to
// "00:00" instead of rendering garbage in the timer.
const formatElapsed = (elapsedSeconds) => {
  const elapsed =
    Number.isFinite(elapsedSeconds) && elapsedSeconds > 0
      ? Math.floor(elapsedSeconds)
      : 0;

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${mmss}` : mmss;
};

// Both fields must be non-empty after trimming. No format checks here —
// the backend validates; the popup only guards empty submissions.
const validateLoginFields = (email, password) => {
  if (!email.trim() || !password.trim()) {
    return { valid: false, error: 'Please fill in all fields.' };
  }
  return { valid: true };
};

// Goal is required (trimmed). Duration is optional; when present it must
// be digits only — no decimals, no exponent notation, so "1e2" and "2.5"
// are rejected instead of being silently truncated by parseInt — and
// between 1 and 480 minutes inclusive.
const validateSessionInput = (goal, duration) => {
  const trimmedGoal = goal.trim();
  if (!trimmedGoal) {
    return { valid: false, error: 'Please enter a goal for your focus session.' };
  }

  const trimmedDuration = duration.trim();
  if (!trimmedDuration) {
    return { valid: true, goal: trimmedGoal, duration: null };
  }

  if (!/^\d+$/.test(trimmedDuration)) {
    return {
      valid: false,
      error: 'Please enter a valid duration between 1 and 480 minutes.',
    };
  }

  const minutes = parseInt(trimmedDuration, 10);
  if (minutes < 1 || minutes > 480) {
    return {
      valid: false,
      error: 'Please enter a valid duration between 1 and 480 minutes.',
    };
  }

  return { valid: true, goal: trimmedGoal, duration: minutes };
};

globalThis.fpPopupHelpers = {
  formatElapsed,
  validateLoginFields,
  validateSessionInput,
};
