// A scripted stand-in for the FocalPoint API, installed as global fetch.
// Routes are "METHOD /path" (path may contain :id). Unmatched calls fail loudly.
export const API = 'https://focalpoint-q8r5.onrender.com';

export const createFakeBackend = () => {
  const routes = new Map();
  const calls = [];

  const match = (method, path) => {
    for (const [key, handler] of routes) {
      const [m, pattern] = key.split(' ');
      if (m !== method) continue;
      const re = new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`);
      if (re.test(path)) return handler;
    }
    return null;
  };

  const fetch = async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const { pathname } = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, path: pathname, headers: init.headers || {}, body });
    const handler = match(method, pathname);
    if (!handler) throw new Error(`fakeBackend: no route for ${method} ${pathname}`);
    const result = await handler({ body, headers: init.headers || {}, path: pathname });
    if (result instanceof Error) throw result; // simulate a network failure
    const { status = 200, json = {} } = result;
    return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(json) };
  };

  return {
    fetch,
    calls,
    /** on('POST /api/classify', {status, json}) or a function returning one (or an Error). */
    on: (route, response) => routes.set(route, typeof response === 'function' ? response : () => response),
    callsTo: (method, pathPrefix) => calls.filter((c) => c.method === method && c.path.startsWith(pathPrefix)),
  };
};
