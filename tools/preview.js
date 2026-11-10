/** Local-only Refract host simulator. Each iframe remains an independent game client. */
const PROTOCOL = 'refract-activity/1';
const MAX_BYTES = 16 * 1024;
const APP_URL = new URL('../index.html', window.location.href);
const USERS = [
  { id: 101, name: 'Alex', avatarUrl: null },
  { id: 202, name: 'Sam', avatarUrl: null },
  { id: 303, name: 'Taylor', avatarUrl: null },
];
const clients = new Map();
const views = document.getElementById('views');
const thirdButton = document.getElementById('toggle-third');
let participants = USERS.slice(0, 2);
let sessionId = newSessionId();
let eventCount = 0;

function newSessionId() { return `idler-preview-${crypto.randomUUID()}`; }
function log(message) {
  const item = document.createElement('li');
  item.textContent = `${String(++eventCount).padStart(3, '0')}  ${message}`;
  const list = document.getElementById('event-log');
  list.prepend(item);
  while (list.children.length > 20) list.lastElementChild.remove();
  document.getElementById('event-count').textContent = `${eventCount} events`;
}
function post(client, message) {
  client?.frame?.contentWindow?.postMessage({ protocol: PROTOCOL, ...message }, APP_URL.origin);
}
function initialize(client) {
  if (!participants.some(({ id }) => id === client.user.id)) return;
  post(client, { type: 'init', sessionId, channelId: 1, self: client.user, participants, theme: 'dark' });
  log(`Connected ${client.user.name}`);
}
function updateRoster() {
  const hasThird = participants.some(({ id }) => id === USERS[2].id);
  thirdButton.textContent = hasThird ? 'Remove third player' : 'Add third player';
  thirdButton.setAttribute('aria-pressed', String(hasThird));
  document.getElementById('participant-summary').textContent = `${participants.length} players · host: ${participants[0]?.name ?? 'none'}`;
  for (const client of clients.values()) {
    const joined = participants.some(({ id }) => id === client.user.id);
    client.leave.hidden = !joined;
    client.status.textContent = joined ? `${participants[0]?.id === client.user.id ? 'Host' : 'Participant'} · user ${client.user.id}` : 'Left the activity';
    client.refresh.textContent = joined ? 'Reload' : 'Rejoin';
    if (joined) post(client, { type: 'participants', participants });
  }
  log(`Crew: ${participants.map(({ name }) => name).join(', ') || 'empty'}`);
}
function mount(client) {
  const frame = document.createElement('iframe');
  frame.src = APP_URL.href;
  frame.title = `${client.user.name}'s game`;
  frame.dataset.participantId = String(client.user.id);
  frame.setAttribute('allow', 'autoplay; fullscreen; clipboard-write');
  frame.referrerPolicy = 'no-referrer';
  client.frame = frame;
  client.container.replaceChildren(frame);
  // Initialization responds to the official helper's ready message. Sending
  // another init on iframe load can race its subscription setup.
}
function createCard(user) {
  const card = document.createElement('article');
  card.className = 'view';
  card.dataset.player = String(user.id);
  const header = document.createElement('header');
  header.className = 'view-header';
  const avatar = document.createElement('span');
  avatar.className = 'avatar'; avatar.textContent = user.name[0]; avatar.ariaHidden = 'true';
  const person = document.createElement('div'); person.className = 'person';
  const name = document.createElement('h2'); name.textContent = user.name;
  const status = document.createElement('p'); person.append(name, status);
  const refresh = document.createElement('button'); refresh.type = 'button'; refresh.textContent = 'Reload';
  const leave = document.createElement('button'); leave.type = 'button'; leave.textContent = 'Leave';
  refresh.ariaLabel = `Reload or rejoin as ${user.name}`; leave.ariaLabel = `Leave as ${user.name}`;
  header.append(avatar, person, refresh, leave);
  const container = document.createElement('div'); container.className = 'frame-container';
  card.append(header, container); views.append(card);
  const client = { user, card, status, refresh, leave, container, frame: null };
  clients.set(user.id, client);
  refresh.addEventListener('click', () => {
    if (participants.some(({ id }) => id === user.id)) { mount(client); log(`Reloading ${user.name}`); }
    else join(user);
  });
  leave.addEventListener('click', () => remove(user.id));
  return client;
}
function join(user) {
  if (participants.some(({ id }) => id === user.id)) return;
  if (participants.length === 0) sessionId = newSessionId();
  const client = clients.get(user.id) ?? createCard(user);
  participants = [...participants, user]; client.card.hidden = false;
  updateRoster(); mount(client);
}
function remove(id) {
  const client = clients.get(id);
  if (!client || !participants.some((person) => person.id === id)) return;
  participants = participants.filter((person) => person.id !== id);
  client.frame = null;
  const empty = document.createElement('div'); empty.className = 'empty-view';
  const title = document.createElement('strong'); title.textContent = `${client.user.name} left`;
  const text = document.createElement('p'); text.textContent = 'The next participant hosts the same run. Rejoin to catch up with the crew.';
  empty.append(title, text); client.container.replaceChildren(empty);
  if (id === USERS[2].id) client.card.hidden = true;
  updateRoster();
}
function validBroadcast(message) {
  if (!Object.hasOwn(message, 'data')) return false;
  if (message.to !== undefined && (!Array.isArray(message.to) || message.to.length > 100 || !message.to.every((id) => Number.isSafeInteger(id) && id > 0))) return false;
  try { return new TextEncoder().encode(JSON.stringify(message.data)).length <= MAX_BYTES; } catch { return false; }
}
window.addEventListener('message', (event) => {
  if (event.origin !== APP_URL.origin) return;
  const sender = [...clients.values()].find((client) => client.frame?.contentWindow === event.source);
  if (!sender || !participants.some(({ id }) => id === sender.user.id)) return;
  const message = event.data;
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.protocol !== PROTOCOL) return;
  if (message.type === 'ready') initialize(sender);
  else if (message.type === 'close') remove(sender.user.id);
  else if (message.type === 'fullscreen') {
    post(sender, { type: 'fullscreen', on: false });
  } else if (message.type === 'broadcast') {
    if (!validBroadcast(message)) {
      post(sender, { type: 'result', id: message.id, error: 'Invalid or oversized relay message' });
      return;
    }
    for (const target of participants) {
      if (target.id !== sender.user.id && (!message.to || message.to.includes(target.id))) {
        post(clients.get(target.id), { type: 'message', from: sender.user.id, data: message.data });
      }
    }
    // The official helper retains each broadcast promise until the host replies.
    post(sender, { type: 'result', id: message.id });
    if (message.data?.kind !== 'state') log(`${sender.user.name} → ${message.data?.kind ?? 'message'}`);
  }
});
thirdButton.addEventListener('click', () => {
  if (participants.some(({ id }) => id === USERS[2].id)) remove(USERS[2].id);
  else join(USERS[2]);
});
document.getElementById('new-session').addEventListener('click', () => {
  sessionId = newSessionId();
  participants = participants.some(({ id }) => id === USERS[2].id) ? [...USERS] : USERS.slice(0, 2);
  for (const client of clients.values()) { client.frame = null; client.container.replaceChildren(); }
  for (const user of participants) {
    const client = clients.get(user.id) ?? createCard(user); client.card.hidden = false; mount(client);
  }
  updateRoster(); log('New independent session started');
});
for (const user of participants) createCard(user);
for (const user of participants) mount(clients.get(user.id));
updateRoster();
