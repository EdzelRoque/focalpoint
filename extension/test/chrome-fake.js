// Hand-rolled fake of the chrome.* surface the extension uses, promise-shaped
// like MV3 (sinon-chrome is callback-era MV2 and unmaintained). Create one per
// test so listener registrations and storage state never leak across cases.
//
// Returns { chrome, dispatchMessage, dispatchTabActivated, dispatchTabUpdated,
// fireStorageChanged }. Assign fake.chrome to globalThis.chrome BEFORE
// importing the script under test — the scripts register listeners at load.
import { vi } from 'vitest';

export const createChromeFake = () => {
  const localData = {};
  const changedListeners = [];
  const messageListeners = [];
  const activatedListeners = [];
  const updatedListeners = [];

  // Chrome serializes storage values; structuredClone mimics that so tests
  // catch code that relies on shared object references with storage.
  const clone = (value) => (value === undefined ? undefined : structuredClone(value));

  const fireStorageChanged = (changes, areaName = 'local') => {
    for (const listener of changedListeners) listener(changes, areaName);
  };

  const storageLocal = {
    get: vi.fn(async (keys) => {
      const names = typeof keys === 'string' ? [keys] : keys;
      const result = {};
      for (const name of names) {
        if (name in localData) result[name] = clone(localData[name]);
      }
      return result;
    }),
    set: vi.fn(async (items) => {
      const changes = {};
      for (const [name, value] of Object.entries(items)) {
        changes[name] = { oldValue: clone(localData[name]), newValue: clone(value) };
        localData[name] = clone(value);
      }
      fireStorageChanged(changes);
    }),
    remove: vi.fn(async (keys) => {
      const names = typeof keys === 'string' ? [keys] : keys;
      const changes = {};
      for (const name of names) {
        if (!(name in localData)) continue;
        changes[name] = { oldValue: clone(localData[name]) };
        delete localData[name];
      }
      if (Object.keys(changes).length > 0) fireStorageChanged(changes);
    }),
    clear: vi.fn(async () => {
      const changes = {};
      for (const name of Object.keys(localData)) {
        changes[name] = { oldValue: clone(localData[name]) };
        delete localData[name];
      }
      if (Object.keys(changes).length > 0) fireStorageChanged(changes);
    }),
  };

  const chrome = {
    storage: {
      local: storageLocal,
      onChanged: {
        addListener: vi.fn((listener) => changedListeners.push(listener)),
      },
    },
    runtime: {
      onMessage: {
        addListener: vi.fn((listener) => messageListeners.push(listener)),
      },
      // Broadcasts (e.g. stats_update). Resolves by default; tests simulate a
      // closed popup with mockRejectedValue / mockImplementation.
      sendMessage: vi.fn(async () => undefined),
    },
    tabs: {
      onActivated: {
        addListener: vi.fn((listener) => activatedListeners.push(listener)),
      },
      onUpdated: {
        addListener: vi.fn((listener) => updatedListeners.push(listener)),
      },
      sendMessage: vi.fn(async () => undefined),
      create: vi.fn(async () => undefined),
    },
  };

  // Delivers a message to every registered onMessage listener and resolves
  // with the sendResponse payload. Handlers return true and respond async,
  // so the promise settles when sendResponse is called — don't await it for
  // handlers that never respond (content.js's listener).
  const dispatchMessage = (message, sender = {}) =>
    new Promise((resolve) => {
      for (const listener of messageListeners) {
        listener(message, sender, resolve);
      }
    });

  const dispatchTabActivated = (activeInfo) =>
    Promise.all(activatedListeners.map((listener) => listener(activeInfo)));

  const dispatchTabUpdated = (tabId, changeInfo, tab = { id: tabId }) =>
    Promise.all(updatedListeners.map((listener) => listener(tabId, changeInfo, tab)));

  return {
    chrome,
    dispatchMessage,
    dispatchTabActivated,
    dispatchTabUpdated,
    fireStorageChanged,
  };
};
