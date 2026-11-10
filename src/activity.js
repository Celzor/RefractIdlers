/** Refract identity and authenticated relay, with one coordinating browser per call. */
export const GAME_PROTOCOL = 'refract-idlers/1';
const MAX_BYTES = 16 * 1024;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const token = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const idsOf = (people) => people.map(({ id }) => id);
const sameIds = (a, b) => Array.isArray(a) && a.length === b.length && a.every((id, index) => id === b[index]);
const noop = () => {};

/**
 * The game owns simulation and rules. This adapter authenticates transport and
 * elects participants[0] as host. Only that host may publish simulation state.
 *
 * onAction(fromId, action): host only; validate actions against your game rules.
 * onState(snapshot, { revision, epoch, hostId }): peers only.
 * onReady({ self, participants, sessionId, isHost, theme, mode }): initialize game.
 * onParticipants(people, { hostChanged, wasHost, isHost, hostId }): reconcile players.
 * validateState(snapshot): optional pure shape validator, applied before acceptance.
 * connector: optional official connectToRefract replacement for protocol tests.
 */
export function createActivityBridge({
  onReady = noop, onParticipants = noop, onAction = noop, onState = noop,
  onConnection = noop, onError = noop, onFullscreen = noop,
  validateState = record, scope = globalThis, connector,
} = {}) {
  const embedded = Boolean(scope.parent && scope.parent !== scope);
  let mode = embedded ? 'connecting' : 'solo';
  let self = embedded ? null : { id: 'you', name: 'You', avatarUrl: null };
  let participants = self ? [self] : [];
  let sessionId = embedded ? null : 'solo';
  let theme = 'dark';
  let transport = null;
  let destroyed = false;
  let epoch = null;
  let revision = -1;
  let snapshot = null;
  let pendingRequest = null;
  let actionSequence = 0;
  let requestTimer = null;
  let readyTimer = null;
  let fullscreen = false;
  const actionSource = token();
  const seenActions = new Map();
  const unsubscribers = [];
  const nativeFullscreenChanged = () => {
    fullscreen = Boolean(scope.document?.fullscreenElement);
    if (!destroyed) onFullscreen(fullscreen);
  };
  if (!embedded) scope.document?.addEventListener?.('fullscreenchange', nativeFullscreenChanged);

  const hostId = () => participants[0]?.id ?? null;
  const member = (id) => participants.some((person) => person.id === id);
  const isHost = () => self !== null && member(self.id) && hostId() === self.id;
  const report = (error) => { if (!destroyed) onError(error instanceof Error ? error : new Error(String(error))); };
  const info = () => ({ self, participants: [...participants], sessionId, isHost: isHost(), theme, mode });

  function wire(kind, extra = {}, to) {
    if (destroyed || !transport || mode !== 'refract' || !member(self?.id)) return;
    const data = { protocol: GAME_PROTOCOL, sessionId, hostId: hostId(), kind, ...extra };
    try {
      if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_BYTES) throw new Error('Idler state exceeds Refract’s 16 KiB message limit.');
      Promise.resolve(transport.broadcast(data, to)).catch(report);
    } catch (error) { report(error); }
  }

  function sendSnapshot(to, replyTo) {
    if (!isHost() || snapshot === null) return;
    wire('state', { epoch, revision, members: idsOf(participants), state: snapshot, ...(replyTo ? { replyTo } : {}) }, to);
  }

  function requestState() {
    if (destroyed || mode !== 'refract' || !member(self?.id)) return;
    if (isHost()) { sendSnapshot(); return; }
    pendingRequest = token();
    wire('sync', { requestId: pendingRequest }, [hostId()]);
  }

  function receive(from, data) {
    if (destroyed || !member(self?.id) || !member(from) || !record(data)
      || data.protocol !== GAME_PROTOCOL || data.sessionId !== sessionId || data.hostId !== hostId()) return;
    if (data.kind === 'sync') {
      if (isHost() && typeof data.requestId === 'string' && data.requestId.length <= 100) sendSnapshot([from], data.requestId);
      return;
    }
    if (data.kind === 'state') {
      if (isHost() || from !== hostId() || !sameIds(data.members, idsOf(participants))
        || typeof data.epoch !== 'string' || data.epoch.length > 100
        || !Number.isSafeInteger(data.revision) || data.revision < 0) return;
      let valid = false;
      try { valid = validateState(data.state) === true; } catch { return; }
      if (!valid) return;
      const requested = pendingRequest !== null && data.replyTo === pendingRequest;
      // A new host epoch is accepted only in reply to this page's fresh sync.
      // Delayed packets from a host's previous load cannot roll back a round.
      if (epoch !== data.epoch && !requested) {
        // An unsolicited snapshot can overtake the answer to our first sync.
        // Preserve its outstanding token so that queued answer can settle it.
        if (pendingRequest === null) requestState();
        return;
      }
      if (epoch === data.epoch && data.revision < revision) return;
      if (epoch === data.epoch && data.revision === revision && !requested) return;
      epoch = data.epoch;
      revision = data.revision;
      snapshot = clone(data.state);
      pendingRequest = null;
      onState(clone(snapshot), { epoch, revision, hostId: hostId() });
      return;
    }
    if (data.kind === 'action' && isHost()) {
      if (data.epoch !== epoch || !record(data.action) || typeof data.actionId !== 'string' || data.actionId.length > 150) {
        sendSnapshot([from]);
        return;
      }
      const seen = seenActions.get(from) ?? new Set();
      if (seen.has(data.actionId)) return;
      seen.add(data.actionId);
      if (seen.size > 256) seen.delete(seen.values().next().value);
      seenActions.set(from, seen);
      onAction(from, clone(data.action));
    }
  }

  function updateParticipants(next) {
    if (destroyed || !self) return;
    const previousHost = hostId();
    const wasHost = isHost();
    participants = next.map((person) => ({ ...person }));
    const hostChanged = previousHost !== hostId();
    if (hostChanged) {
      epoch = isHost() ? token() : null;
      revision = -1;
      pendingRequest = null;
      seenActions.clear();
    }
    if (!member(self.id)) {
      report(new Error('You have left this Refract activity.'));
      return;
    }
    onParticipants([...participants], { hostChanged, wasHost, isHost: isHost(), hostId: hostId() });
    // Roster-qualified snapshots cannot be mistaken for the previous membership.
    if (isHost()) sendSnapshot();
    else requestState();
  }

  async function connect() {
    if (!embedded) {
      epoch = token();
      onConnection(mode);
      onReady(info());
      return;
    }
    onConnection(mode);
    try {
      // Loaded at the page root so GitHub project subpaths and local preview
      // use the identical official, unmodified Refract API module.
      const connectToRefract = connector ?? (await import(/* @vite-ignore */ new URL('refract-activity.js', scope.document.baseURI).href)).connectToRefract;
      if (destroyed) return;
      transport = connectToRefract({ host: scope.parent, source: scope });
      readyTimer = setTimeout(() => report(new Error('Waiting for Refract. Open this activity from a call, or check the registered activity URL.')), 10000);
      const init = await transport.ready;
      if (destroyed) return;
      clearTimeout(readyTimer);
      self = { ...init.self };
      participants = init.participants.map((person) => ({ ...person }));
      sessionId = init.sessionId;
      theme = init.theme;
      mode = 'refract';
      epoch = isHost() ? token() : null;
      unsubscribers.push(transport.onMessage(receive));
      unsubscribers.push(transport.onParticipants(updateParticipants));
      unsubscribers.push(transport.onFullscreen((on) => { fullscreen = on; onFullscreen(on); }));
      onConnection(mode);
      onReady(info());
      requestState();
      // Refract does not retain messages; asking again recovers a missed join,
      // a reloaded coordinator, or a temporary relay interruption.
      requestTimer = setInterval(() => { if (!isHost()) requestState(); }, 3000);
    } catch (error) { report(error); }
  }

  // Let the caller assign its bridge variable before any callbacks run.
  queueMicrotask(() => { if (!destroyed) void connect(); });

  return {
    get mode() { return mode; },
    get isHost() { return isHost(); },
    get self() { return self; },
    get participants() { return [...participants]; },
    get sessionId() { return sessionId; },
    get fullscreen() { return fullscreen; },
    requestState,
    sendAction(action) {
      if (destroyed || mode === 'connecting' || !record(action) || !member(self?.id)) return false;
      if (isHost()) onAction(self.id, clone(action));
      else if (epoch !== null) wire('action', { epoch, actionId: `${actionSource}:${++actionSequence}`, action: clone(action) }, [hostId()]);
      else { requestState(); return false; }
      return true;
    },
    publishState(state) {
      if (destroyed || !isHost()) return false;
      try {
        if (!validateState(state)) return false;
        const next = clone(state);
        const candidate = { protocol: GAME_PROTOCOL, sessionId, hostId: hostId(), kind: 'state',
          epoch, revision: revision + 1, members: idsOf(participants), state: next,
          // Leave room for a targeted sync reply's request identifier.
          replyTo: '0'.repeat(100) };
        if (new TextEncoder().encode(JSON.stringify(candidate)).length > MAX_BYTES) {
          report(new Error('Idler state exceeds Refract’s 16 KiB message limit.'));
          return false;
        }
        snapshot = next;
      } catch { return false; }
      revision += 1;
      sendSnapshot();
      return true;
    },
    setFullscreen(on = !fullscreen) {
      if (mode === 'refract') transport?.setFullscreen(on);
      else if (on) Promise.resolve(scope.document?.documentElement.requestFullscreen?.()).catch(report);
      else Promise.resolve(scope.document?.exitFullscreen?.()).catch(report);
    },
    close() { transport?.close(); },
    destroy() {
      destroyed = true;
      clearTimeout(readyTimer);
      clearInterval(requestTimer);
      for (const unsubscribe of unsubscribers) unsubscribe();
      scope.document?.removeEventListener?.('fullscreenchange', nativeFullscreenChanged);
      transport?.disconnect();
      seenActions.clear();
    },
  };
}
