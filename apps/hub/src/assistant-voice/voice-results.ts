type Json = Readonly<Record<string, unknown>>;

interface Projection {
  readonly drop: ReadonlySet<string>;
}

const FLAGS_DROPPED_WHEN_FALSE: ReadonlySet<string> = new Set(['favourite', 'hidden']);

const PROJECTIONS: ReadonlyMap<string, Projection> = new Map([
  [
    'get_home',
    { drop: new Set(['position', 'updated_at', 'latitude', 'longitude', 'sign_in', 'room_id']) },
  ],
  [
    'find_devices',
    {
      drop: new Set(['provider', 'model', 'manufacturer', 'room_id', 'updated_at', 'observed_at']),
    },
  ],
  [
    'get_device',
    {
      drop: new Set(['details', 'updated_at', 'observed_at', 'group', 'tier', 'access', 'room_id']),
    },
  ],
]);

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (isRecord(value) && Object.keys(value).length === 0)
  );
}

function pruned(value: unknown, projection: Projection): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => pruned(entry, projection));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, entry]) =>
          !projection.drop.has(key) && !(entry === false && FLAGS_DROPPED_WHEN_FALSE.has(key)),
      )
      .map(([key, entry]) => [key, pruned(entry, projection)])
      .filter(([, entry]) => !isEmpty(entry)),
  );
}

function reachedName(name: string, args: Readonly<Record<string, unknown>>): string {
  const forwarded = args['name'];
  return name === 'call_tool' && typeof forwarded === 'string' ? forwarded : name;
}

export function voiceResponseOf(
  name: string,
  args: Readonly<Record<string, unknown>>,
  response: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const projection = PROJECTIONS.get(reachedName(name, args));
  if (projection === undefined || 'error' in response) {
    return response;
  }
  const result = pruned(response, projection);
  return isRecord(result) ? result : response;
}
