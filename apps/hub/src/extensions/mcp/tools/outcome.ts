type Fields = Readonly<Record<string, unknown>>;

const PAST: Readonly<Record<string, string>> = {
  add: 'Added',
  answer: 'Answered',
  apply: 'Applied',
  assign: 'Assigned',
  branch: 'Branched',
  call: 'Called',
  cancel: 'Cancelled',
  check: 'Checked',
  clear: 'Cleared',
  close: 'Closed',
  control: 'Controlled',
  create: 'Created',
  delete: 'Deleted',
  edit: 'Edited',
  end: 'Ended',
  hang: 'Hung',
  log: 'Logged',
  notify: 'Notified',
  open: 'Opened',
  post: 'Posted',
  press: 'Pressed',
  publish: 'Published',
  record: 'Recorded',
  refresh: 'Refreshed',
  remove: 'Removed',
  restart: 'Restarted',
  retry: 'Retried',
  revoke: 'Revoked',
  run: 'Ran',
  schedule: 'Scheduled',
  send: 'Sent',
  set: 'Set',
  show: 'Showed',
  speak: 'Spoke',
  start: 'Started',
  stop: 'Stopped',
  sync: 'Synced',
  update: 'Updated',
  write: 'Wrote',
};

const FAILED_STATES: ReadonlySet<string> = new Set([
  'failed',
  'error',
  'expired',
  'rejected',
  'refused',
]);
const OPEN_STATES: ReadonlySet<string> = new Set(['pending', 'running']);
const PROBLEM_LISTS = ['skipped', 'failed', 'errors', 'rejected'] as const;
const ENTITY_FACTS = [
  'state',
  'status',
  'outcome',
  'detail',
  'reason',
  'enabled',
  'url',
  'path',
  'operation',
  'windows',
] as const;
const LABEL_KEYS = ['device', 'name', 'title', 'deviceId', 'device_id', 'id'] as const;
const REASON_KEYS = ['reason', 'error', 'message', 'status'] as const;
const NOISY_KEY = /(_at|At|_id|Id)$|^allFinished$/u;
const SHOWN_ITEMS = 20;
const SHOWN_TEXT = 200;

function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clip(text: string): string {
  return text.length > SHOWN_TEXT ? `${text.slice(0, SHOWN_TEXT)}…` : text;
}

function textOf(value: unknown): string | null {
  if (typeof value === 'string' && value !== '') return clip(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function firstText(item: Fields, keys: readonly string[]): string | null {
  for (const key of keys) {
    const text = textOf(item[key]);
    if (text !== null) return text;
  }
  return null;
}

interface Phrase {
  readonly past: string;
  readonly noun: string;
}

function phraseOf(part: string): Phrase {
  const words = part.split('_');
  const at = words.findIndex((word) => PAST[word] !== undefined);
  if (at < 0) return { past: 'Completed', noun: words.join(' ') };
  return {
    past: PAST[words[at] ?? ''] ?? 'Completed',
    noun: words.filter((_word, index) => index !== at).join(' '),
  };
}

function sentence(phrase: Phrase, name: string | null): string {
  const subject = phrase.noun === '' ? phrase.past : `${phrase.past} ${phrase.noun}`;
  return name === null ? subject : `${subject} “${name}”`;
}

function wrapped(structured: Fields): unknown {
  const keys = Object.keys(structured);
  return keys.length === 1 && keys[0] === 'result' ? structured['result'] : structured;
}

function entityOf(payload: Fields): Fields | null {
  if (typeof payload['id'] === 'string') return payload;
  const nested = Object.values(payload).find(
    (value): value is Fields => isRecord(value) && typeof value['id'] === 'string',
  );
  return nested ?? null;
}

function revisionOf(entity: Fields): string | number | null {
  const stated = entity['revision'];
  return typeof stated === 'string' || typeof stated === 'number' ? stated : null;
}

function problemsOf(payload: Fields): readonly Fields[] {
  return PROBLEM_LISTS.flatMap((key) => {
    const list = payload[key];
    return Array.isArray(list) ? list.slice(0, SHOWN_ITEMS).map(problemOf) : [];
  });
}

function problemOf(item: unknown): Fields {
  if (!isRecord(item)) return { item: textOf(item) ?? '' };
  return { item: firstText(item, LABEL_KEYS) ?? '', reason: firstText(item, REASON_KEYS) ?? '' };
}

function failureOf(payload: Fields): string | null {
  const error = textOf(payload['error']);
  if (error !== null) return error;
  const state = textOf(payload['state'] ?? payload['status']);
  if (state === null || !FAILED_STATES.has(state)) return null;
  return textOf(payload['detail'] ?? payload['reason']) ?? state;
}

function countsOf(payload: Fields): string {
  const counts = Object.entries(payload)
    .filter(([key, value]) => Array.isArray(value) && !PROBLEM_LISTS.some((one) => one === key))
    .slice(0, 3)
    .map(([key, value]) => `${String(Array.isArray(value) ? value.length : 0)} ${key}`);
  return counts.length === 0 ? '' : ` (${counts.join(', ')})`;
}

function scalarFacts(payload: Fields, entity: Fields | null): Fields {
  const entries = Object.entries(payload).filter(([key, value]) =>
    entity === payload
      ? ENTITY_FACTS.some((one) => one === key)
      : !NOISY_KEY.test(key) && key !== 'error' && textOf(value) !== null && key !== 'ok',
  );
  return Object.fromEntries(entries.flatMap(([key, value]) => textual(key, value)));
}

function textual(key: string, value: unknown): [string, string | number | boolean][] {
  if (typeof value === 'number' || typeof value === 'boolean') return [[key, value]];
  const text = textOf(value);
  return text === null ? [] : [[key, text]];
}

function identity(entity: Fields | null): Fields {
  if (entity === null) return {};
  const revision = revisionOf(entity);
  return {
    id: entity['id'],
    ...(revision === null ? {} : { revision }),
  };
}

function nameOf(entity: Fields | null, payload: Fields): string | null {
  return firstText(entity ?? payload, ['name', 'title', 'label']);
}

function rehearsalFacts(rehearsal: Fields): Fields {
  const commands = Array.isArray(rehearsal['commands']) ? rehearsal['commands'] : [];
  const nodes = Array.isArray(rehearsal['nodes']) ? rehearsal['nodes'] : [];
  const sent = commands.filter(isRecord).map((command) => ({
    node: command['node'],
    kind: command['kind'],
    targets: command['targets'],
    params: command['params'],
    outcome: command['outcome'],
  }));
  return {
    outcome: rehearsal['outcome'],
    error: rehearsal['error'],
    steps: rehearsal['steps'],
    nodes: nodes.length,
    commands: sent.slice(0, SHOWN_ITEMS),
    ...(sent.length > SHOWN_ITEMS ? { moreCommands: sent.length - SHOWN_ITEMS } : {}),
    ...(rehearsal['outputs'] === null ? {} : { outputs: rehearsal['outputs'] }),
  };
}

function programFacts(payload: Fields): Fields {
  const { problems, rehearsal } = payload;
  return {
    ...(Array.isArray(problems) && problems.length > 0
      ? { problems: problems.slice(0, SHOWN_ITEMS) }
      : {}),
    ...(isRecord(rehearsal) ? { rehearsal: rehearsalFacts(rehearsal) } : {}),
  };
}

function recordOutcome(phrase: Phrase, payload: Fields): Fields {
  const commands = payload['commands'];
  const entity = entityOf(payload);
  if (Array.isArray(commands) && commands.every(isRecord))
    return commandsOutcome(phrase, payload, commands, entity);
  const problems = problemsOf(payload);
  const failure = failureOf(payload);
  return {
    ok: failure === null && problems.length === 0 && payload['ok'] !== false,
    summary: `${sentence(phrase, nameOf(entity, payload))}${countsOf(payload)}`,
    ...identity(entity),
    ...scalarFacts(payload, entity),
    ...(failure === null ? {} : { error: failure }),
    ...(problems.length === 0 ? {} : { skipped: problems }),
    ...programFacts(payload),
  };
}

function commandsOutcome(
  phrase: Phrase,
  payload: Fields,
  commands: readonly Fields[],
  entity: Fields | null,
): Fields {
  const status = (command: Fields): string => textOf(command['status']) ?? '';
  const done = commands.filter((command) => status(command) === 'succeeded');
  const failed = commands.filter((command) => FAILED_STATES.has(status(command)));
  const open = commands.filter((command) => OPEN_STATES.has(status(command)));
  const skipped = problemsOf(payload);
  const note = [
    `${String(done.length)} of ${String(commands.length)} commands done`,
    failed.length > 0 ? `${String(failed.length)} failed` : null,
    open.length > 0 ? `${String(open.length)} still running` : null,
    skipped.length > 0 ? `${String(skipped.length)} skipped` : null,
  ].filter((part): part is string => part !== null);
  return {
    ok: failed.length === 0 && skipped.length === 0,
    summary: `${sentence(phrase, nameOf(entity, payload))}: ${note.join(', ')}`,
    ...identity(entity),
    ...scalarFacts(payload, null),
    ...(done.length === 0 ? {} : { changed: done.slice(0, SHOWN_ITEMS).map(changedOf) }),
    ...(failed.length === 0 ? {} : { failed: failed.slice(0, SHOWN_ITEMS).map(failedOf) }),
    ...(skipped.length === 0 ? {} : { skipped }),
  };
}

function changedOf(command: Fields): Fields {
  const result = command['result'];
  const shown = result === null || result === undefined ? null : clip(JSON.stringify(result));
  return {
    device: firstText(command, ['device', 'device_id']) ?? '',
    capability: textOf(command['capability']) ?? '',
    ...(command['now'] === null || command['now'] === undefined ? {} : { now: command['now'] }),
    ...(shown === null ? {} : { result: shown }),
  };
}

function failedOf(command: Fields): Fields {
  return {
    device: firstText(command, ['device', 'device_id']) ?? '',
    capability: textOf(command['capability']) ?? '',
    reason: firstText(command, ['error', 'status']) ?? '',
  };
}

function listOutcome(phrase: Phrase, items: readonly unknown[]): Fields {
  const ids = items
    .flatMap((item) => (isRecord(item) && typeof item['id'] === 'string' ? [item['id']] : []))
    .slice(0, SHOWN_ITEMS);
  return {
    ok: true,
    summary: `${phrase.past} ${String(items.length)} ${phrase.noun}`.trim(),
    count: items.length,
    ...(ids.length === 0 ? {} : { ids }),
  };
}

export function outcomeOf(part: string, structured: Fields): Fields {
  const phrase = phraseOf(part);
  const payload = wrapped(structured);
  if (Array.isArray(payload)) return listOutcome(phrase, payload);
  if (!isRecord(payload)) return { ok: true, summary: sentence(phrase, null) };
  return recordOutcome(phrase, payload);
}
