// Cross-user effects must never happen: one student can't see, end, or change
// another student's sessions or stats.
import { describe, it, expect, beforeEach } from 'vitest';
import { newApp, signUp, startSession } from './support/api.js';
import { rawSession } from './support/db.js';

let api, alice, bob, aliceSession;
beforeEach(async () => {
  api = newApp();
  alice = await signUp(api);
  bob = await signUp(api);
  aliceSession = (await startSession(api, alice.auth)).body;
});

describe('another student\'s session', () => {
  it('cannot be read (403)', async () => {
    expect((await api.get(`/api/sessions/${aliceSession._id}`).set(bob.auth)).status).toBe(403);
  });

  it('cannot be ended (403), and stays active', async () => {
    expect((await api.put(`/api/sessions/${aliceSession._id}`).set(bob.auth)).status).toBe(403);
    expect((await rawSession(aliceSession._id)).isActive).toBe(true);
  });

  it('cannot have blocks added (403), and the count is unchanged', async () => {
    expect((await api.post(`/api/sessions/${aliceSession._id}/block`).set(bob.auth)).status).toBe(403);
    expect((await rawSession(aliceSession._id)).blockCount).toBe(0);
  });

  it('does not appear in their session list', async () => {
    const list = await api.get('/api/sessions').set(bob.auth);
    expect(list.body).toEqual([]);
  });

  it('does not stop them from starting their own session', async () => {
    expect((await startSession(api, bob.auth)).status).toBe(201);
  });
});

describe('settings', () => {
  it('changing your settings never changes another student\'s', async () => {
    await api.put('/auth/settings').set(alice.auth)
      .send({ username: alice.creds.username, email: alice.creds.email, blockSensitivity: 'standard', strictMode: true });
    const bobsView = await api.get('/auth/me').set(bob.auth);
    expect(bobsView.body.preferences.strictMode).toBe(false);
  });

  it('cannot take another student\'s username or email (409)', async () => {
    const res = await api.put('/auth/settings').set(bob.auth)
      .send({ username: alice.creds.username, email: bob.creds.email, blockSensitivity: 'standard', strictMode: false });
    expect(res.status).toBe(409);
    const res2 = await api.put('/auth/settings').set(bob.auth)
      .send({ username: bob.creds.username, email: alice.creds.email, blockSensitivity: 'standard', strictMode: false });
    expect(res2.status).toBe(409);
  });

  it('cannot take another student\'s username with different casing (409)', async () => {
    const res = await api.put('/auth/settings').set(bob.auth)
      .send({ username: alice.creds.username.toUpperCase(), email: bob.creds.email, blockSensitivity: 'standard', strictMode: false });
    expect(res.status).toBe(409);
  });
});
