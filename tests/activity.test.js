import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivityBridge } from '../src/activity.js';

const clone = (value) => structuredClone(value);
const settle = () => new Promise((resolve) => setImmediate(resolve));
const person = (id) => ({ id, name: `Pilot ${id}`, avatarUrl: null });
const validState = (state) => state !== null && typeof state === 'object' && Number.isFinite(state.score);

/** In-memory implementation of the official helper, preserving sender identity. */
function room(t) {
  let roster = [];
  const clients = new Map();
  const allClients = [];
  t.after(() => { for (const client of allClients) client.bridge.destroy(); });

  function join(id, { initialState = { score: 0 }, sessionId = 'test-session' } = {}) {
    roster = [...roster, person(id)];
    for (const client of clients.values()) client.handlers.participants?.(clone(roster));
    const client = {
      id, handlers: {}, sent: [], received: [], actions: [], rosterEvents: [], errors: [],
      state: clone(initialState), bridge: null,
    };
    clients.set(id, client);
    allClients.push(client);
    const subscribe = (kind, handler) => {
      client.handlers[kind] = handler;
      return () => { delete client.handlers[kind]; };
    };
    const helper = {
      ready: Promise.resolve({ self: person(id), participants: clone(roster), sessionId, theme: 'dark' }),
      onMessage: (fn) => subscribe('message', fn),
      onParticipants: (fn) => subscribe('participants', fn),
      onFullscreen: (fn) => subscribe('fullscreen', fn),
      broadcast(data, to) {
        client.sent.push({ data: clone(data), to: to && [...to] });
        for (const [otherId, other] of clients) {
          if (otherId !== id && (!to || to.includes(otherId))) other.handlers.message?.(id, clone(data));
        }
        return Promise.resolve();
      },
      disconnect() {}, close() {}, setFullscreen() {},
    };
    client.bridge = createActivityBridge({
      scope: { parent: {}, document: { baseURI: 'https://games.example/idlers/' } },
      connector: () => helper,
      validateState: validState,
      onReady() { if (client.bridge.isHost) client.bridge.publishState(client.state); },
      onParticipants(next, change) {
        client.rosterEvents.push({ next, change });
        if (client.bridge.isHost) client.bridge.publishState(client.state);
      },
      onState(state, meta) { client.state = state; client.received.push({ state, meta }); },
      onAction(from, action) { client.actions.push({ from, action }); },
      onError(error) { client.errors.push(error); },
    });
    return client;
  }

  function leave(id) {
    clients.get(id).bridge.destroy();
    clients.delete(id);
    roster = roster.filter((member) => member.id !== id);
    for (const client of clients.values()) client.handlers.participants?.(clone(roster));
  }
  return { join, leave };
}

test('late joiners request the host snapshot and receive subsequent state', async (t) => {
  const relay = room(t);
  const host = relay.join(11, { initialState: { score: 73 } });
  await settle();
  const peer = relay.join(22);
  await settle();

  assert.equal(host.bridge.isHost, true);
  assert.equal(peer.bridge.isHost, false);
  assert.equal(peer.bridge.mode, 'refract');
  assert.deepEqual(peer.state, { score: 73 });
  assert.ok(peer.sent.some(({ data, to }) => data.kind === 'sync' && to[0] === 11));
  assert.equal(host.bridge.publishState({ score: 105 }), true);
  assert.deepEqual(peer.state, { score: 105 });
  assert.equal(peer.bridge.publishState({ score: 9999 }), false);
});

test('an unsolicited initial snapshot does not replace a pending asynchronous sync token', async (t) => {
  const roster = [person(1), person(2)];
  const clients = new Map();
  let broadcasts = 0;
  const errors = [];
  const bridges = [];
  t.after(() => { for (const bridge of bridges) bridge.destroy(); });
  function connect(id) {
    const handlers = {};
    const states = [];
    const item = { handlers, states, bridge: null };
    clients.set(id, item);
    const subscribe = (kind, handler) => {
      handlers[kind] = handler;
      return () => { delete handlers[kind]; };
    };
    const helper = {
      ready: Promise.resolve({ self: person(id), participants: roster, sessionId: 'async-call', theme: 'dark' }),
      onMessage: (fn) => subscribe('message', fn),
      onParticipants: (fn) => subscribe('participants', fn),
      onFullscreen: (fn) => subscribe('fullscreen', fn),
      broadcast(data, to) {
        broadcasts++;
        // Real postMessage queues delivery. This order puts the host's first
        // unsolicited state ahead of the reply to the peer's initial request.
        // A bounded queue makes a regressed request/reply storm fail promptly.
        if (broadcasts > 30) return Promise.reject(new Error('Unexpected synchronization message storm'));
        setImmediate(() => {
          for (const [otherId, other] of clients) {
            if (otherId !== id && (!to || to.includes(otherId))) other.handlers.message?.(id, clone(data));
          }
        });
        return Promise.resolve();
      },
      disconnect() {}, close() {}, setFullscreen() {},
    };
    item.bridge = createActivityBridge({
      scope: { parent: {}, document: { baseURI: 'https://games.example/' } }, connector: () => helper,
      validateState: validState,
      onReady() { if (item.bridge.isHost) item.bridge.publishState({ score: 321 }); },
      onState(state) { states.push(state); }, onError(error) { errors.push(error.message); },
    });
    bridges.push(item.bridge);
    return item;
  }
  connect(1);
  const peer = connect(2);
  for (let i = 0; i < 12; i++) await settle();
  assert.deepEqual(peer.states.at(-1), { score: 321 });
  assert.deepEqual(errors, []);
  assert.ok(broadcasts <= 5, `Expected a bounded initial handshake; observed ${broadcasts} broadcasts`);
});

test('actions use the authenticated sender and repeated action IDs are ignored', async (t) => {
  const relay = room(t);
  const host = relay.join(1);
  await settle();
  const peer = relay.join(2);
  await settle();
  const action = { type: 'buy', upgradeId: 'triple', round: 2, playerId: 1 };
  assert.equal(peer.bridge.sendAction(action), true);
  assert.deepEqual(host.actions, [{ from: 2, action }]);

  const packet = peer.sent.findLast(({ data }) => data.kind === 'action').data;
  host.handlers.message(2, clone(packet));
  assert.equal(host.actions.length, 1);
  host.handlers.message(1234, { ...packet, actionId: 'nonmember' });
  host.handlers.message(2, { ...packet, epoch: 'old-host-epoch', actionId: 'wrong-epoch' });
  host.handlers.message(2, { ...packet, sessionId: 'another-call', actionId: 'wrong-session' });
  assert.equal(host.actions.length, 1);
});

test('foreign senders, sessions, rosters, malformed state, and old revisions are rejected', async (t) => {
  const relay = room(t);
  const host = relay.join(1);
  await settle();
  const peer = relay.join(2);
  await settle();
  const third = relay.join(3);
  await settle();
  host.bridge.publishState({ score: 100 });
  const packet = host.sent.findLast(({ data }) => data.kind === 'state').data;
  const count = peer.received.length;

  const forged = { ...packet, revision: packet.revision + 50, state: { score: 999 } };
  peer.handlers.message(third.id, forged);
  peer.handlers.message(1, { ...forged, sessionId: 'another-call' });
  peer.handlers.message(1, { ...forged, hostId: 3 });
  peer.handlers.message(1, { ...forged, members: [1, 3, 2] });
  peer.handlers.message(1, { ...forged, state: { score: 'corrupt' } });
  peer.handlers.message(1, { ...packet, revision: packet.revision - 1, state: { score: 1 } });
  assert.equal(peer.received.length, count);
  assert.deepEqual(peer.state, { score: 100 });
});

test('new host epochs require a reply to the peer’s own current sync request', async (t) => {
  const relay = room(t);
  const host = relay.join(1);
  await settle();
  const peer = relay.join(2);
  await settle();
  const before = clone(peer.state);
  const packet = host.sent.findLast(({ data }) => data.kind === 'state').data;
  peer.handlers.message(1, {
    ...packet, epoch: 'unsolicited-epoch', revision: 0, replyTo: 'unrelated-request', state: { score: 999 },
  });
  assert.deepEqual(peer.state, before);
  assert.notEqual(peer.received.at(-1).meta.epoch, 'unsolicited-epoch');
  assert.equal(peer.sent.at(-1).data.kind, 'sync');
});

test('host departure promotes the earliest remaining participant and preserves last state', async (t) => {
  const relay = room(t);
  const host = relay.join(1);
  await settle();
  const second = relay.join(2);
  await settle();
  const third = relay.join(3);
  await settle();
  host.bridge.publishState({ score: 487 });
  const oldPacket = clone(host.sent.findLast(({ data }) => data.kind === 'state').data);
  const oldEpoch = third.received.at(-1).meta.epoch;

  relay.leave(1);
  assert.equal(second.bridge.isHost, true);
  assert.equal(third.bridge.isHost, false);
  assert.deepEqual(second.state, { score: 487 });
  assert.deepEqual(third.state, { score: 487 });
  assert.notEqual(third.received.at(-1).meta.epoch, oldEpoch);
  assert.deepEqual(third.bridge.participants.map(({ id }) => id), [2, 3]);
  assert.equal(second.rosterEvents.at(-1).change.hostChanged, true);

  third.handlers.message(1, oldPacket);
  assert.deepEqual(third.state, { score: 487 });
  assert.equal(third.bridge.sendAction({ type: 'boost', round: 3 }), true);
  assert.deepEqual(second.actions, [{ from: 3, action: { type: 'boost', round: 3 } }]);
});

test('standalone startup is asynchronous and local actions run once without a relay', async (t) => {
  let ready = 0;
  const actions = [];
  const bridge = createActivityBridge({
    scope: {},
    onReady(info) { ready++; assert.equal(info.mode, 'solo'); },
    onAction(from, action) { actions.push({ from, action }); },
  });
  t.after(() => bridge.destroy());
  assert.equal(ready, 0);
  await settle();
  assert.equal(ready, 1);
  assert.equal(bridge.self.id, 'you');
  assert.equal(bridge.isHost, true);
  assert.equal(bridge.sendAction({ type: 'start' }), true);
  assert.deepEqual(actions, [{ from: 'you', action: { type: 'start' } }]);
});

test('invalid and oversized snapshots cannot replace the last publishable state', async (t) => {
  const relay = room(t);
  const host = relay.join(1, { initialState: { score: 81 } });
  await settle();
  const peer = relay.join(2);
  await settle();
  assert.equal(host.bridge.publishState({ score: 'invalid' }), false);
  assert.equal(host.bridge.publishState({ score: 999, padding: 'x'.repeat(16 * 1024) }), false);
  assert.deepEqual(peer.state, { score: 81 });
  assert.match(host.errors.at(-1).message, /16 KiB/);
  peer.bridge.requestState();
  assert.deepEqual(peer.state, { score: 81 });
});

test('departed participants lose action authority and cannot publish snapshots', async (t) => {
  const relay = room(t);
  const host = relay.join(1);
  await settle();
  const peer = relay.join(2);
  await settle();
  peer.bridge.sendAction({ type: 'click' });
  const packet = clone(peer.sent.findLast(({ data }) => data.kind === 'action').data);
  relay.leave(2);
  host.handlers.message(2, { ...packet, actionId: 'after-departure' });
  assert.equal(host.actions.length, 1);
  assert.equal(peer.bridge.sendAction({ type: 'click' }), false);
  assert.equal(peer.bridge.publishState({ score: 100000 }), false);
});

