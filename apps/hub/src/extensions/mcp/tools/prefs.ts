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

async function writeOf<T extends object>(
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

export function readPref(context: ToolContext, key: ClientPrefKey, as: ActingAs): Promise<unknown> {
  switch (key) {
    case 'appearance':
      return readOf(context, CLIENT_PREFS.appearance, as);
    case 'call_ring':
      return readOf(context, CLIENT_PREFS.call_ring, as);
    case 'cameras':
      return readOf(context, CLIENT_PREFS.cameras, as);
    case 'health_sync':
      return readOf(context, CLIENT_PREFS.health_sync, as);
    case 'nutrition':
      return readOf(context, CLIENT_PREFS.nutrition, as);
    case 'ai_models':
      return readOf(context, CLIENT_PREFS.ai_models, as);
  }
}

export function writePref(
  context: ToolContext,
  key: ClientPrefKey,
  patch: Readonly<Record<string, unknown>>,
  as: ActingAs,
): Promise<unknown> {
  switch (key) {
    case 'appearance':
      return writeOf(context, CLIENT_PREFS.appearance, patch, as);
    case 'call_ring':
      return writeOf(context, CLIENT_PREFS.call_ring, patch, as);
    case 'cameras':
      return writeOf(context, CLIENT_PREFS.cameras, patch, as);
    case 'health_sync':
      return writeOf(context, CLIENT_PREFS.health_sync, patch, as);
    case 'nutrition':
      return writeOf(context, CLIENT_PREFS.nutrition, patch, as);
    case 'ai_models':
      return writeOf(context, CLIENT_PREFS.ai_models, patch, as);
  }
}
