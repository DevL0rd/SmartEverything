import fc from 'fast-check';

export const DEVICES = [
  '3a000000-0000-4000-8000-0000000000a1',
  '3a000000-0000-4000-8000-0000000000a2',
  '3a000000-0000-4000-8000-0000000000a3',
] as const;
export const VALUES = [
  '3a000000-0000-4000-8000-0000000000b1',
  '3a000000-0000-4000-8000-0000000000b2',
] as const;
export const INPUT_NAMES = ['level', 'delay'] as const;
export const CONTROLS = ['power', 'brightness', 'temperature'] as const;
const SEQUENCES = [
  '3a000000-0000-4000-8000-0000000000c1',
  '3a000000-0000-4000-8000-0000000000c2',
] as const;
const ROOMS = ['3a000000-0000-4000-8000-0000000000d1'] as const;
const GROUPS = ['3a000000-0000-4000-8000-0000000000f1'] as const;
const PEOPLE = ['3a000000-0000-4000-8000-0000000000e1'] as const;

const id = fc.uuid({ version: 4 });
const device = fc.constantFrom(...DEVICES);
const control = fc.constantFrom(...CONTROLS);
const small = fc.integer({ min: 0, max: 100 });
const clock = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([hour, minute]) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
const weekdays = fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 7 });
const weatherMetric = fc.constantFrom('temperature', 'humidity', 'wind_speed', 'uv_index');
const weatherKinds = fc.uniqueArray(fc.constantFrom('clear', 'rain', 'snow', 'storm'), {
  minLength: 1,
  maxLength: 3,
});

const literal = fc.oneof(
  small,
  fc.boolean(),
  fc.string({ maxLength: 4 }),
  fc.array(small, { maxLength: 3 }),
  fc.dictionary(
    fc.constantFrom('r', 'g', 'from'),
    fc.oneof(small, fc.constant({ from: 1 }), fc.string({ maxLength: 3 })),
  ),
);

const numeric = fc.oneof(
  fc.record({ operator: fc.constantFrom('gt', 'gte', 'lt', 'lte'), value: small }),
  fc
    .tuple(small, small)
    .map(([a, b]) => ({ operator: 'between', min: Math.min(a, b), max: Math.max(a, b) })),
);
const valueComparison = fc.oneof(
  numeric,
  fc.record({ operator: fc.constantFrom('eq', 'ne'), value: literal }),
);
const comparison = fc.oneof(valueComparison, fc.constant({ operator: 'changed' }));

const kind = fc.constantFrom('number', 'duration');
const offset = fc.oneof(
  fc.constant(undefined),
  fc.record({
    operation: fc.constantFrom('add', 'subtract'),
    amount: small,
    unit: fc.constantFrom('number', 'milliseconds'),
    minimum: fc.option(small, { nil: undefined }),
    maximum: fc.option(small, { nil: undefined }),
  }),
);
const binding = fc.oneof(
  fc.record({ source: fc.constant('literal'), kind, value: small }),
  fc.record({ source: fc.constant('value'), kind, valueId: fc.constantFrom(...VALUES) }),
  fc.record({ source: fc.constant('parameter'), kind, name: fc.constantFrom(...INPUT_NAMES) }),
  fc.record({ source: fc.constant('capability'), kind, deviceId: device, capability: control }),
);
const automationInput = fc.tuple(binding, offset).map(([source, change]) => ({
  binding: source,
  ...(change === undefined
    ? {}
    : { offset: { ...change, unit: source.kind === 'duration' ? 'milliseconds' : 'number' } }),
}));
const commandInput = fc.oneof(
  automationInput.map((input) => ({ type: 'value', input })),
  fc
    .dictionary(fc.constantFrom('level', 'mode'), automationInput, { minKeys: 1 })
    .map((fields) => ({
      type: 'fields',
      fields,
    })),
);

const trigger = fc.oneof(
  fc.record({ type: fc.constant('state'), deviceId: device, capability: control, comparison }),
  fc.record({
    type: fc.constant('event'),
    deviceId: fc.option(device, { nil: null }),
    kind: fc.constantFrom('doorbell', 'motion', 'person'),
  }),
  fc.record({ type: fc.constant('time'), at: clock, weekdays }),
  fc.record({
    type: fc.constant('sun'),
    event: fc.constantFrom('sunrise', 'sunset'),
    offsetMinutes: fc.integer({ min: -60, max: 60 }),
  }),
  fc.record({ type: fc.constant('interval'), everyMinutes: fc.integer({ min: 1, max: 600 }) }),
  fc.record({ type: fc.constant('weather'), metric: weatherMetric, comparison: numeric }),
  fc.record({ type: fc.constant('weather_kind'), kinds: weatherKinds }),
  fc.record({
    type: fc.constant('signal'),
    source: fc.constantFrom('device', 'event', 'health'),
    kind: fc.constantFrom('state', 'sleep', 'doorbell'),
    subject: fc.option(device, { nil: null }),
    field: fc.option(control, { nil: null }),
    match: fc.dictionary(fc.constantFrom('detection', 'zone'), literal, { maxKeys: 2 }),
    comparison: fc.option(comparison, { nil: null }),
    window: fc.option(
      fc.record({
        mode: fc.constantFrom('avg', 'max', 'count'),
        seconds: fc.integer({ min: 1, max: 600 }),
      }),
      { nil: null },
    ),
    debounceSeconds: fc.integer({ min: 0, max: 5 }),
    holdSeconds: fc.integer({ min: 0, max: 5 }),
    cooldownSeconds: fc.integer({ min: 0, max: 5 }),
  }),
  fc.record({
    type: fc.constant('speech'),
    phrase: fc.constantFrom('lights on', 'good night'),
    caseSensitive: fc.boolean(),
    includeBots: fc.boolean(),
    source: fc.oneof(
      fc.constant(null),
      device.map((deviceId) => ({ kind: 'camera', deviceId })),
      fc.constant({ kind: 'plugin', pluginId: 'speech-plugin', sourceId: 'mic' }),
      id.map((chatId) => ({ kind: 'attachment', chatId })),
    ),
  }),
);
const triggers = fc.array(trigger, { minLength: 1, maxLength: 3 });

const condition = fc.oneof(
  fc.record({
    type: fc.constant('state'),
    deviceId: device,
    capability: control,
    comparison: valueComparison,
  }),
  fc.constant({ type: 'time_window', after: '09:00', before: '17:30' }),
  fc.constant({ type: 'time_window', after: '22:00', before: '06:00' }),
  weekdays.map((days) => ({ type: 'weekday', weekdays: days })),
  fc.record({ type: fc.constant('weather'), metric: weatherMetric, comparison: numeric }),
  fc.record({ type: fc.constant('weather_kind'), kinds: weatherKinds }),
  fc.record({
    type: fc.constant('daylight'),
    is: fc.constantFrom('day', 'night'),
    sunriseOffsetMinutes: fc.integer({ min: -30, max: 30 }),
    sunsetOffsetMinutes: fc.integer({ min: -30, max: 30 }),
  }),
  fc.record({
    type: fc.constant('value'),
    valueId: fc.constantFrom(...VALUES),
    comparison: valueComparison,
  }),
  fc.record({ type: fc.constant('binding'), input: automationInput, comparison: valueComparison }),
);
const conditions = fc.oneof(
  fc.record({ mode: fc.constant('all'), items: fc.array(condition, { maxLength: 3 }) }),
  fc.record({
    mode: fc.constant('any'),
    items: fc.array(condition, { minLength: 1, maxLength: 3 }),
  }),
);

const target = fc.oneof(
  fc.record({ kind: fc.constant('group'), groupId: fc.constantFrom(...GROUPS) }),
  fc.record({
    kind: fc.constant('room'),
    roomId: fc.constantFrom(...ROOMS),
    families: fc.option(fc.constant(['light']), { nil: undefined }),
  }),
  fc.record({
    kind: fc.constant('devices'),
    deviceIds: fc.array(device, { minLength: 1, maxLength: 3 }),
  }),
);

const operation = fc.oneof(
  fc.record({ type: fc.constant('set'), value: literal }),
  fc.record({ type: fc.constant('add'), value: small }),
);
const valueOperation = fc.oneof(
  fc.record({
    kind: fc.constant('number'),
    operation: fc.record({ type: fc.constant('set'), value: small }),
  }),
  fc.record({
    kind: fc.constant('number'),
    operation: fc.record({ type: fc.constantFrom('add', 'subtract'), value: small }),
  }),
  fc.record({ kind: fc.constant('boolean'), operation: fc.constant({ type: 'toggle' }) }),
  fc.record({
    kind: fc.constant('choice'),
    operation: fc.constantFrom({ type: 'next' }, { type: 'previous' }),
  }),
);

const leafAction = fc.oneof(
  fc.record({
    type: fc.constant('command'),
    deviceId: device,
    capability: control,
    value: literal,
  }),
  fc.record({ type: fc.constant('scene'), sceneId: id }),
  fc.record({ type: fc.constant('delay'), seconds: fc.integer({ min: 1, max: 3600 }) }),
  fc.record({ type: fc.constant('notify'), message: fc.constantFrom('hello', 'Door open') }),
  fc.record({
    type: fc.constant('wake_ai'),
    profileId: fc.constantFrom(...PEOPLE),
    chatId: fc.option(id, { nil: null }),
    instruction: fc.constantFrom('look around', 'say hi'),
  }),
  fc.record({
    type: fc.constant('tool'),
    profileId: fc.constantFrom(...PEOPLE),
    tool: fc.constantFrom('call', 'speak'),
    args: fc.dictionary(fc.constantFrom('a', 'b'), small, { maxKeys: 2 }),
  }),
);
const structuredLeaf = fc.oneof(
  fc.record({
    type: fc.constant('command'),
    deviceId: device,
    capability: control,
    binding: commandInput,
  }),
  fc.record({
    type: fc.constant('target_command'),
    target,
    capability: control,
    scale: fc.option(fc.constant('percent'), { nil: undefined }),
    value: literal,
  }),
  fc.record({
    type: fc.constant('target_command'),
    target,
    capability: control,
    binding: commandInput,
  }),
  fc.record({
    type: fc.constant('temporary_effect'),
    target,
    capability: control,
    operation,
    durationMs: fc.integer({ min: 1000, max: 600_000 }),
    while: fc.option(conditions, { nil: undefined }),
    priority: fc.integer({ min: -3, max: 3 }),
  }),
  fc.record({
    type: fc.constant('sequence'),
    sequenceId: fc.constantFrom(...SEQUENCES),
    parameters: fc.dictionary(fc.constantFrom(...INPUT_NAMES), automationInput, { maxKeys: 2 }),
  }),
  fc.record({
    type: fc.constant('value_update'),
    valueId: fc.constantFrom(...VALUES),
    operation: valueOperation,
  }),
  fc.constant({ type: 'stop', target: { type: 'current' } }),
  fc.record({
    type: fc.constant('stop'),
    target: fc.record({
      type: fc.constantFrom('automation', 'sequence'),
      id: fc.constantFrom(...SEQUENCES),
      controlKey: fc.option(fc.constantFrom('k1', 'k2'), { nil: undefined }),
    }),
  }),
);

const actionTree = fc.letrec<{ action: unknown; block: unknown[] }>((tie) => ({
  block: fc.array(tie('action'), { minLength: 1, maxLength: 3 }),
  action: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    leafAction,
    structuredLeaf,
    fc.record({
      type: fc.constant('choose'),
      branches: fc.array(fc.record({ conditions, actions: tie('block') }), {
        minLength: 1,
        maxLength: 2,
      }),
      otherwise: fc.option(tie('block'), { nil: undefined }),
    }),
    fc.record({
      type: fc.constant('repeat'),
      repeat: fc.oneof(
        fc.record({ mode: fc.constant('count'), count: fc.integer({ min: 1, max: 5 }) }),
        fc.record({ mode: fc.constantFrom('while', 'until'), conditions }),
      ),
      actions: tie('block'),
      maximumDurationMs: fc.integer({ min: 1000, max: 60_000 }),
      intervalMs: fc.integer({ min: 100, max: 5000 }),
    }),
  ),
})).block;

const STRUCTURED = new Set([
  'target_command',
  'temporary_effect',
  'choose',
  'repeat',
  'sequence',
  'value_update',
  'stop',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type Next = () => string;

function nextId(): Next {
  let count = 0;
  return () => {
    count += 1;
    return `00000000-0000-4000-8000-${count.toString(16).padStart(12, '0')}`;
  };
}

function blockOf(value: unknown, next: Next): unknown {
  return Array.isArray(value) ? value.map((action) => actionOf(action, next)) : value;
}

function branchOf(branch: unknown, next: Next): unknown {
  return isRecord(branch)
    ? { ...branch, nodeId: next(), actions: blockOf(branch['actions'], next) }
    : branch;
}

function actionOf(action: unknown, next: Next): unknown {
  if (!isRecord(action)) return action;
  const id = next();
  const required =
    STRUCTURED.has(String(action['type'])) || 'binding' in action || id.endsWith('1');
  return {
    ...action,
    ...(required ? { nodeId: id } : {}),
    ...('actions' in action ? { actions: blockOf(action['actions'], next) } : {}),
    ...('otherwise' in action ? { otherwise: blockOf(action['otherwise'], next) } : {}),
    ...(Array.isArray(action['branches'])
      ? { branches: action['branches'].map((branch) => branchOf(branch, next)) }
      : {}),
  };
}

function triggerIds(entries: readonly object[], next: Next): object[] {
  return entries.map((entry) => {
    const id = next();
    return id.endsWith('1') ? { ...entry, nodeId: id } : entry;
  });
}

const runPolicy = fc.oneof(
  fc.constant(undefined),
  fc.constantFrom({ mode: 'single' }, { mode: 'restart' }),
  fc.record({ mode: fc.constant('queue'), limit: fc.integer({ min: 1, max: 100 }) }),
  fc.record({ mode: fc.constant('parallel'), limit: fc.integer({ min: 1, max: 32 }) }),
);
const origin = fc.oneof(
  fc.constant(null),
  fc.record({
    plugin_id: fc.constant('some-plugin'),
    requester: fc.constantFrom('owner', 'approved', 'unlisted'),
  }),
);
const controlKey = fc.option(fc.constantFrom('k1', 'k2'), { nil: undefined });

export const definition = fc
  .record({ triggers, conditions, actions: actionTree, origin, runPolicy, controlKey })
  .map((entry) => {
    const next = nextId();
    return {
      ...entry,
      triggers: triggerIds(entry.triggers, next),
      actions: blockOf(entry.actions, next),
      ...(entry.runPolicy === undefined ? {} : { runPolicy: entry.runPolicy }),
      ...(entry.controlKey === undefined ? {} : { controlKey: entry.controlKey }),
    };
  });

export const sequenceDefinition = fc
  .record({
    actions: actionTree,
    parameters: fc.uniqueArray(
      fc.record({
        name: fc.constantFrom(...INPUT_NAMES),
        kind: fc.constantFrom('boolean', 'number', 'duration', 'choice', 'string'),
      }),
      { selector: (parameter) => parameter.name, maxLength: 2 },
    ),
    origin,
    runPolicy,
    controlKey,
  })
  .map((entry) => ({
    ...entry,
    actions: blockOf(entry.actions, nextId()),
    ...(entry.runPolicy === undefined ? {} : { runPolicy: entry.runPolicy }),
    ...(entry.controlKey === undefined ? {} : { controlKey: entry.controlKey }),
  }));
