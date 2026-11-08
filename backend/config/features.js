// Block sensitivity levels that are released to users. Only "standard" ships
// for now; "lenient" and "strict" stay implemented (prompt + validation) for a
// future update. To release a level, add it here (and un-blur the Settings
// slider in the frontend).
export const RELEASED_SENSITIVITIES = ['standard'];
export const DEFAULT_SENSITIVITY = 'standard';

// The sensitivity actually applied for a (validated) requested level.
export const effectiveSensitivity = (requested) =>
    RELEASED_SENSITIVITIES.includes(requested) ? requested : DEFAULT_SENSITIVITY;
