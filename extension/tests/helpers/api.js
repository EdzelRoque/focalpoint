// Node-side client for the real local backend spawned by global-setup.js.
// Every helper throws loudly on 429 so a tripped rate limiter (global 60/min,
// auth 10/min — hardcoded in backend/app.js) reads as a clear failure, not a
// mystery assertion miss.

const backendUrl = () => process.env.FP_BACKEND_URL;

const request = async (method, route, { token, body } = {}) => {
  const res = await fetch(`${backendUrl()}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 429) {
    throw new Error(
      `Backend rate limiter tripped on ${method} ${route} — the journey ` +
        'suite exceeded the hardcoded limits in backend/app.js',
    );
  }
  return { status: res.status, data: await res.json() };
};

export const sharedToken = () => process.env.FP_TOKEN;
export const sharedUser = () => ({
  username: process.env.FP_USERNAME,
  email: process.env.FP_EMAIL,
  password: process.env.FP_PASSWORD,
});

export const createSession = async (sessionGoal, durationInMinutes) => {
  const { status, data } = await request('POST', '/api/sessions', {
    token: sharedToken(),
    body: { sessionGoal, ...(durationInMinutes ? { durationInMinutes } : {}) },
  });
  if (status !== 201) {
    throw new Error(`createSession failed (${status}): ${JSON.stringify(data)}`);
  }
  return data;
};

export const getSessions = async () => {
  const { status, data } = await request('GET', '/api/sessions', {
    token: sharedToken(),
  });
  if (status !== 200) {
    throw new Error(`getSessions failed (${status}): ${JSON.stringify(data)}`);
  }
  return data;
};

export const getSession = async (sessionId) => {
  const sessions = await getSessions();
  const session = sessions.find((s) => s._id === sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found on backend`);
  return session;
};

export const endSession = (sessionId) =>
  request('PUT', `/api/sessions/${sessionId}`, { token: sharedToken() });

// Best-effort cleanup so the shared user's one-active-session constraint
// never leaks a 409 into the next test.
export const endActiveSessions = async () => {
  const sessions = await getSessions();
  for (const s of sessions.filter((s) => s.isActive)) {
    await endSession(s._id);
  }
};

// PUT /auth/settings requires the full settings object, so preference flips
// re-send the shared user's identity fields.
export const updatePreferences = async ({ blockSensitivity, strictMode }) => {
  const { username, email } = sharedUser();
  const { status, data } = await request('PUT', '/auth/settings', {
    token: sharedToken(),
    body: { username, email, blockSensitivity, strictMode },
  });
  if (status !== 200) {
    throw new Error(`updatePreferences failed (${status}): ${JSON.stringify(data)}`);
  }
  return data;
};
