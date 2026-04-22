import rateLimit, { MemoryStore } from 'express-rate-limit';

export function createLimiters({ store, ...overrides } = {}) {
    const makeStore = () => store ?? new MemoryStore();
    return {
        global:   rateLimit({ windowMs: 60_000, max: 60,  store: makeStore(), ...overrides }),
        auth:     rateLimit({ windowMs: 60_000, max: 10,  store: makeStore(), ...overrides }),
        classify: rateLimit({ windowMs: 60_000, max: 100, store: makeStore(), ...overrides }),
    };
}
