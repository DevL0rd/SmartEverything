export const BOOKING_SCRIPT = `
const root = document.getElementById('booking');
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const base = location.pathname;
const days = Number(root.dataset.days);
const el = (id) => document.getElementById(id);
const dayStrip = el('days');
const times = el('times');
const status = el('status');
const form = el('details');
const done = el('done');
const dayKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const dayNumber = new Intl.DateTimeFormat(undefined, { day: 'numeric' });
const month = new Intl.DateTimeFormat(undefined, { month: 'short' });
const longDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
let byDay = new Map();
let chosenDay = null;
let chosen = null;
el('zone').textContent = zone;
function say(text, tone) {
  status.textContent = text;
  status.className = tone === undefined ? 'notice' : 'notice ' + tone;
  status.hidden = text === '';
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className !== '') node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function pickTime(slot, button) {
  chosen = slot;
  for (const other of times.querySelectorAll('button')) other.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-pressed', 'true');
  el('when').textContent = longDay.format(new Date(slot.start)) + ', ' + clock.format(new Date(slot.start)) + ' to ' + clock.format(new Date(slot.end));
  form.hidden = false;
  el('name').focus({ preventScroll: true });
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function showTimes(key) {
  chosenDay = key;
  chosen = null;
  form.hidden = true;
  for (const chip of dayStrip.querySelectorAll('button')) chip.setAttribute('aria-pressed', String(chip.dataset.day === key));
  times.textContent = '';
  for (const slot of byDay.get(key) ?? []) {
    const button = element('button', 'time', clock.format(new Date(slot.start)));
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => pickTime(slot, button));
    times.append(button);
  }
  el('day-title').textContent = longDay.format(new Date((byDay.get(key) ?? [])[0].start));
  el('pick').hidden = false;
}
function dayChip(key, slots) {
  const at = new Date(slots[0].start);
  const chip = element('button', 'day', '');
  chip.type = 'button';
  chip.dataset.day = key;
  chip.setAttribute('aria-pressed', 'false');
  chip.setAttribute('aria-label', longDay.format(at) + ', ' + slots.length + (slots.length === 1 ? ' time' : ' times'));
  chip.append(element('span', 'wd', weekday.format(at)), element('span', 'dn', dayNumber.format(at)), element('span', 'mo', month.format(at)), element('span', 'count', String(slots.length)));
  chip.addEventListener('click', () => showTimes(key));
  return chip;
}
function show(slots) {
  byDay = new Map();
  for (const slot of slots) {
    const key = dayKey.format(new Date(slot.start));
    byDay.set(key, [...(byDay.get(key) ?? []), slot]);
  }
  dayStrip.textContent = '';
  el('loading').hidden = true;
  if (byDay.size === 0) {
    el('pick').hidden = true;
    say('No times are open in the next ' + days + (days === 1 ? ' day.' : ' days.') + ' Try again later.');
    return;
  }
  say('');
  for (const [key, list] of byDay) dayStrip.append(dayChip(key, list));
  showTimes(byDay.has(chosenDay) ? chosenDay : byDay.keys().next().value);
}
async function load() {
  const from = new Date();
  const to = new Date(from.getTime() + days * 86400000);
  const query = '?from=' + encodeURIComponent(from.toISOString()) + '&to=' + encodeURIComponent(to.toISOString()) + '&time_zone=' + encodeURIComponent(zone);
  try {
    const reply = await fetch(base + '/slots' + query, { headers: { accept: 'application/json' } });
    const body = await reply.json();
    if (!reply.ok) throw new Error(body.error?.message ?? 'The times could not be loaded.');
    show(body.slots);
  } catch (error) {
    el('loading').hidden = true;
    say(error instanceof Error ? error.message : 'The times could not be loaded.', 'bad');
  }
}
function confirmed(body) {
  form.hidden = true;
  el('pick').hidden = true;
  el('choose').hidden = true;
  say('');
  el('done-when').textContent = longDay.format(new Date(body.start)) + ', ' + clock.format(new Date(body.start)) + ' to ' + clock.format(new Date(body.end));
  el('done-where').textContent = body.location ?? '';
  el('done-where').hidden = body.location === null;
  el('cancel').href = body.cancel_path;
  done.hidden = false;
  done.focus();
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (chosen === null) return;
  const data = new FormData(form);
  const submit = el('book');
  submit.disabled = true;
  submit.textContent = 'Booking…';
  try {
    const reply = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ name: data.get('name'), email: data.get('email'), note: data.get('note') ?? '', start: chosen.start, time_zone: zone }),
    });
    const body = await reply.json();
    if (!reply.ok) {
      say(body.error?.message ?? 'That time could not be booked.', 'bad');
      await load();
      return;
    }
    confirmed(body);
  } catch {
    say('The booking could not be sent. Check the connection and try again.', 'bad');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Book this time';
  }
});
load();
`;
