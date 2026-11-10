/**
 * The activity API: an activity page's side of how it talks to Refract.
 * Every instance serves this file at /activities/refract-activity.js, beside
 * the activities packaged with it, and it always matches the protocol that
 * instance's app speaks (`refract-activity/1`, docs/activities.md). A page
 * hosted elsewhere copies it from an instance into its own repository.
 *
 *   import { connectToRefract } from "./refract-activity.js";
 *   const refract = connectToRefract();
 *   const { self, participants } = await refract.ready;
 *
 * The page holds no credentials. What it sends goes to the Refract window
 * around it, which passes it on over the person's own signed-in connection;
 * the instance checks they are in the call's activity. So a page can only
 * ever act as the person using it, within that session.
 */

const PROTOCOL = "refract-activity/1";
/** the largest message a page can send, as JSON */
export const MAX_MESSAGE_BYTES = 16 * 1024;

/**
 * @typedef {{ id: number, name: string, avatarUrl: string | null }} ActivityUser
 *   someone in the activity: their user ID, the name to show, and a picture URL
 * @typedef {{ sessionId: string, channelId: number, self: ActivityUser, participants: ActivityUser[], theme: "dark" | "light" }} ActivitySession
 * @typedef {{ joined: ActivityUser[], left: ActivityUser[] }} ParticipantsChange
 */

// inputs that take a click or a choice rather than typing
const NON_TEXT_INPUTS = new Set(["button", "checkbox", "radio", "range", "submit", "reset", "color", "file", "image"]);

/** whether a key pressed on `target` would type into it */
function typingIn(target) {
  if (!target || typeof target !== "object") return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA") return true;
  return target.tagName === "INPUT" && !NON_TEXT_INPUTS.has(String(target.type).toLowerCase());
}

// the parameter Refract loads the page with once an admin has refreshed the activity
const REFRESH_PARAM = "refract-refresh";

/**
 * After an admin refreshes the activity, make this copy the latest. The page
 * itself is: Refract loads it at a new address for each refresh. But what it
 * loaded - scripts, styles, pictures - may have come from the browser's cache,
 * which a host such as GitHub Pages lets keep a file for ten minutes. So each
 * file from the page's own site is checked with its server, which brings the
 * cache up to date, and the page loads again, once, if any had changed.
 *
 * Nothing happens until a refresh, or in a page without its own origin (one
 * packaged with Refract, which the instance serves). Resolves to whether the
 * page is loading again. `page` stands in for this window, in tests.
 * @returns {Promise<boolean>}
 */
export async function refreshIfStale(page = globalThis) {
  let revision;
  let checked;
  try {
    revision = new URL(page.location.href).searchParams.get(REFRESH_PARAM);
    if (!revision || page.location.origin === "null") return false;
    // once for each refresh, so a file that keeps changing cannot keep the page reloading
    checked = `refract-activity:refreshed:${revision}`;
    if (page.sessionStorage.getItem(checked)) return false;
    page.sessionStorage.setItem(checked, "1");
  } catch {
    return false;
  }

  const files = new Set();
  for (const entry of page.performance?.getEntriesByType?.("resource") ?? []) {
    try {
      const url = new URL(entry.name);
      url.hash = "";
      if (url.origin === page.location.origin) files.add(url.href);
    } catch {
      // not an address
    }
  }
  const version = (response) => response.headers.get("etag") ?? response.headers.get("last-modified");
  const changed = await Promise.all(
    [...files].map(async (url) => {
      try {
        // what the page has, then what the server has now, which replaces it in the cache
        const cached = version(await page.fetch(url, { cache: "force-cache" }));
        const current = version(await page.fetch(url, { cache: "no-cache" }));
        return !!cached && !!current && cached !== current;
      } catch {
        return false;
      }
    }),
  );
  if (!changed.includes(true)) return false;
  page.location.reload();
  return true;
}

/** the size of `data` as JSON, in bytes; Infinity for what is not JSON */
function messageSize(data) {
  try {
    const json = JSON.stringify(data);
    return json === undefined ? Infinity : new TextEncoder().encode(json).length;
  } catch {
    return Infinity;
  }
}

/**
 * Connect the page to the Refract window around it.
 *
 * Messages are only taken from the window that framed the page. They are
 * posted to it with "*" because the page cannot know which instance it is
 * running in; nothing it sends is secret from the instance relaying it.
 * `host` and `source` stand in for the parent window and this one, in tests.
 */
export function connectToRefract({ host = globalThis.parent, source = globalThis } = {}) {
  if (!host || host === globalThis) throw new Error("An activity runs inside Refract: open it from a call.");

  const messageHandlers = new Set();
  const participantHandlers = new Set();
  const fullscreenHandlers = new Set();
  // broadcasts waiting for the instance's answer, by the id they were sent with
  const pending = new Map();
  let lastId = 0;

  /** @type {ActivityUser | null} */
  let self = null;
  /** @type {ActivityUser[]} */
  let participants = [];
  let fullscreen = false;
  let settle;
  /** @type {Promise<ActivitySession>} */
  const ready = new Promise((resolve) => (settle = resolve));
  const post = (message) => host.postMessage({ protocol: PROTOCOL, ...message }, "*");

  function setParticipants(next) {
    const before = new Set(participants.map((person) => person.id));
    const after = new Set(next.map((person) => person.id));
    const change = {
      joined: next.filter((person) => !before.has(person.id)),
      left: participants.filter((person) => !after.has(person.id)),
    };
    participants = next;
    participantHandlers.forEach((handler) => handler(next, change));
  }

  function listener(event) {
    const message = event.data;
    if (event.source !== host || message?.protocol !== PROTOCOL) return;
    switch (message.type) {
      case "init":
        self = message.self;
        settle(message);
        setParticipants(message.participants);
        break;
      case "participants":
        setParticipants(message.participants);
        break;
      case "message":
        messageHandlers.forEach((handler) => handler(message.from, message.data));
        break;
      case "result": {
        const call = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) call?.reject(new Error(message.error));
        else call?.resolve();
        break;
      }
      case "fullscreen":
        fullscreen = message.on === true;
        fullscreenHandlers.forEach((handler) => handler(fullscreen));
        break;
      case "pushToTalk":
        setTalking(false);
        pushToTalk = message.binding ?? null;
        break;
    }
  }

  // Push to talk. Keys pressed in this page never reach Refract, so while it
  // has the keyboard the one key or button Refract names is passed back to it,
  // and nothing else: the page needs no code of its own for this.
  let pushToTalk = null;
  let talking = false;
  function setTalking(next) {
    if (talking === next) return;
    talking = next;
    post({ type: "pushToTalk", pressed: next });
  }
  const onKeyDown = (event) => {
    if (pushToTalk?.kind !== "key" || event.code !== pushToTalk.code || event.repeat) return;
    if (pushToTalk.ignoreInText && typingIn(event.target)) return;
    setTalking(true);
  };
  const onKeyUp = (event) => {
    if (pushToTalk?.kind === "key" && event.code === pushToTalk.code) setTalking(false);
  };
  const onMouse = (event) => {
    if (pushToTalk?.kind !== "mouse" || event.button !== pushToTalk.button) return;
    // the back and forward buttons would otherwise navigate
    event.preventDefault?.();
    setTalking(event.type === "mousedown");
  };
  // the release would be missed once the page is not focused
  const onBlur = () => setTalking(false);
  const inputs = { keydown: onKeyDown, keyup: onKeyUp, mousedown: onMouse, mouseup: onMouse, blur: onBlur };
  for (const [type, handler] of Object.entries(inputs)) source.addEventListener(type, handler, true);

  source.addEventListener("message", listener);
  post({ type: "ready" });

  // once the page has loaded what it loads, see that none of it is out of date after a refresh
  if (source.document?.readyState === "complete") void refreshIfStale(source);
  else source.addEventListener?.("load", () => void refreshIfStale(source), { once: true });

  const subscribe = (handlers, handler) => {
    handlers.add(handler);
    return () => void handlers.delete(handler);
  };

  return {
    /** settles with the session, once Refract answers */
    ready,
    /** the person using this copy; null until ready */
    get self() {
      return self;
    },
    /** everyone with it open, this person included, in the order they joined */
    get participants() {
      return participants;
    },
    /**
     * Whoever has had it open longest: the one copy everyone agrees on, for
     * work only one should do, such as catching up someone who opens it late.
     * The next in line takes over when they leave.
     */
    get leader() {
      return participants[0] ?? null;
    },

    /**
     * Send any JSON to everyone else with it open, or only the user IDs in
     * `to`. Settles once the instance has passed it on; rejects with the
     * reason it would not: too large, too fast, or the activity has closed.
     * @param {unknown} data
     * @param {number[]} [to]
     * @returns {Promise<void>}
     */
    broadcast(data, to) {
      if (messageSize(data) > MAX_MESSAGE_BYTES) {
        return Promise.reject(new Error(`Activity messages must be JSON of at most ${MAX_MESSAGE_BYTES} bytes.`));
      }
      const id = ++lastId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        post({ type: "broadcast", data, ...(to ? { to } : {}), id });
      });
    },

    /**
     * What the others' copies broadcast. Returns a function that stops listening.
     * @param {(from: number, data: unknown) => void} handler
     */
    onMessage: (handler) => subscribe(messageHandlers, handler),

    /**
     * Whenever someone opens or closes it, and when the page is first told who
     * has it open. Returns a function that stops listening.
     * @param {(participants: ActivityUser[], change: ParticipantsChange) => void} handler
     */
    onParticipants: (handler) => subscribe(participantHandlers, handler),

    /** whether Refract has this page full screen */
    get fullscreen() {
      return fullscreen;
    },
    /**
     * Ask Refract to put the page full screen, or take it out. Only an activity
     * that offers it asks, from a click or key press: the browser refuses it
     * otherwise. A sandboxed frame can't reliably go full screen itself, so
     * Refract does it for the page, and onFullscreen says when it has.
     * @param {boolean} on
     */
    setFullscreen(on) {
      post({ type: "fullscreen", on: !!on });
    },
    /**
     * Whenever the page goes full screen or comes out of it, including when the
     * person leaves it with Esc. Returns a function that stops listening.
     * @param {(on: boolean) => void} handler
     */
    onFullscreen: (handler) => subscribe(fullscreenHandlers, handler),

    /** leave the activity: Refract closes it for this person, and the others carry on */
    close() {
      post({ type: "close" });
    },

    /** stop listening, as when the page tears itself down */
    disconnect() {
      source.removeEventListener("message", listener);
      for (const [type, handler] of Object.entries(inputs)) source.removeEventListener(type, handler, true);
      setTalking(false);
      pushToTalk = null;
      messageHandlers.clear();
      participantHandlers.clear();
      fullscreenHandlers.clear();
      pending.clear();
    },
  };
}
