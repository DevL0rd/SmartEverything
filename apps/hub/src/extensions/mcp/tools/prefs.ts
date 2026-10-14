import {
  API_ENDPOINTS as E,
  CLIENT_PREFS,
  type ClientPrefDefinition,
  type ClientPrefKey,
} from '@smarteverything/domain';
import { operate, type ActingAs } from './acting';
import { ToolError, issuesOf, type ToolContext } from './registry';

async function readOf<T>(
  context: ToolContext,
  definition: ClientPrefDefinition<T>,
  as: ActingAs,
): Promise<T> {
  const stored = E.readLayout.response.parse(
    await operate(context, 'readLayout', { params: { page: definition.storageKey } }, as),
  );
  const read = definition.decode(stored.layout);
  if (read.status === 'invalid') {
    throw new ToolError(read.reason, 'invalid_stored_value');
  }
  return read.value;
}

async function writeOf<T extends Readonly<Record<string, unknown>>>(
  context: ToolContext,
  definition: ClientPrefDefinition<T>,
  patch: Readonly<Record<string, unknown>>,
  as: ActingAs,
): Promise<T> {
  const next = definition.schema.safeParse({
    ...(await readOf(context, definition, as)),
    ...patch,
  });
  if (!next.success) {
    throw new ToolError(`The ${definition.storageKey} preference refused: ${issuesOf(next.error)}`);
  }
  await operate(
    context,
    'saveLayout',
    { params: { page: definition.storageKey }, body: { layout: definition.encode(next.data) } },
    as,
  );
  return next.data;
}

interface PreferenceOperations {
  readonly read: (context: ToolContext, as: ActingAs) => Promise<unknown>;
  readonly write: (
    context: ToolContext,
    patch: Readonly<Record<string, unknown>>,
    as: ActingAs,
  ) => Promise<unknown>;
}
function operations<T extends Readonly<Record<string, unknown>>>(
  definition: ClientPrefDefinition<T>,
): PreferenceOperations {
  return {
    read: (context, as) => readOf(context, definition, as),
    write: (context, patch, as) => writeOf(context, definition, patch, as),
  };
}
const PREFERENCE_OPERATIONS: Readonly<Record<ClientPrefKey, PreferenceOperations>> = {
  appearance: operations(CLIENT_PREFS.appearance),
  call_ring: operations(CLIENT_PREFS.call_ring),
  call_audio: operations(CLIENT_PREFS.call_audio),
  cameras: operations(CLIENT_PREFS.cameras),
  health_sync: operations(CLIENT_PREFS.health_sync),
  nutrition: operations(CLIENT_PREFS.nutrition),
  ai_models: operations(CLIENT_PREFS.ai_models),
  ai_speech: operations(CLIENT_PREFS.ai_speech),
  region: operations(CLIENT_PREFS.region),
};
export function readPref(context: ToolContext, key: ClientPrefKey, as: ActingAs): Promise<unknown> {
  return PREFERENCE_OPERATIONS[key].read(context, as);
}
export function writePref(
  context: ToolContext,
  key: ClientPrefKey,
  patch: Readonly<Record<string, unknown>>,
  as: ActingAs,
): Promise<unknown> {
  return PREFERENCE_OPERATIONS[key].write(context, patch, as);
}
