// A minimal in-memory chrome.* API covering what FocalPoint uses: storage,
// runtime messaging, tabs and alarms. One fresh instance per test.
const listeners = () => {
  const fns = [];
  return {
    addListener: (fn) => fns.push(fn),
    removeListener: (fn) => fns.splice(fns.indexOf(fn), 1),
    fns,
  };
};

const noReceiver = () => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));

export const createFakeChrome = (initialStorage = {}) => {
  let data = structuredClone(initialStorage);
  const onChanged = listeners();
  const fire = (changes) => {
    if (Object.keys(changes).length) for (const fn of [...onChanged.fns]) fn(changes, 'local');
  };

  const pick = (keys) => {
    if (keys == null) return structuredClone(data);
    const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    const out = {};
    for (const k of list) if (k in data) out[k] = structuredClone(data[k]);
    return out;
  };

  const sentRuntime = [];
  const sentToTabs = [];
  const alarms = new Map();
  const onMessage = listeners();
  const onAlarm = listeners();

  const chrome = {
    storage: {
      local: {
        get: async (keys) => pick(keys),
        set: async (items) => {
          const changes = {};
          for (const [k, v] of Object.entries(items)) {
            changes[k] = { oldValue: data[k], newValue: structuredClone(v) };
            data[k] = structuredClone(v);
          }
          fire(changes);
        },
        remove: async (keys) => {
          const changes = {};
          for (const k of [].concat(keys)) {
            if (k in data) { changes[k] = { oldValue: data[k] }; delete data[k]; }
          }
          fire(changes);
        },
        clear: async () => {
          const changes = {};
          for (const k of Object.keys(data)) changes[k] = { oldValue: data[k] };
          data = {};
          fire(changes);
        },
      },
      onChanged,
    },
    runtime: {
      onMessage,
      // What another extension context (popup/background) answers. Default:
      // nobody is listening, which is how Chrome behaves when the popup is closed.
      respond: noReceiver,
      sendMessage: (msg) => { sentRuntime.push(msg); return chrome.runtime.respond(msg); },
    },
    tabs: {
      list: [{ id: 1 }, { id: 2 }],
      query: async () => chrome.tabs.list,
      sendMessage: (tabId, msg) => { sentToTabs.push({ tabId, msg }); return Promise.resolve(); },
      create: async (opts) => { chrome.tabs.created.push(opts); return opts; },
      created: [],
      onActivated: listeners(),
      onUpdated: listeners(),
    },
    action: {
      badge: { text: '', color: null },
      setBadgeText: async ({ text }) => { chrome.action.badge.text = text; },
      setBadgeBackgroundColor: async ({ color }) => { chrome.action.badge.color = color; },
    },
    alarms: {
      create: async (name, info) => { alarms.set(name, { name, scheduledTime: info.when }); },
      clear: async (name) => alarms.delete(name),
      get: async (name) => alarms.get(name),
      onAlarm,
      all: alarms,
    },

    // ---- test helpers ----
    storageData: () => structuredClone(data),
    sentRuntime,
    sentToTabs,
    /** Deliver a message to this context's onMessage listeners; resolves with the response. */
    deliver: (msg, sender = { tab: { id: 1 } }) =>
      new Promise((resolve) => {
        let responded = false;
        let keepOpen = false;
        for (const fn of onMessage.fns) {
          const r = fn(msg, sender, (value) => { responded = true; resolve(value); });
          if (r === true) keepOpen = true;
        }
        if (!responded && !keepOpen) resolve(undefined);
      }),
    fireAlarm: async (name) => { for (const fn of onAlarm.fns) await fn({ name }); },
  };
  return chrome;
};
