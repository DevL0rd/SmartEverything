import {
  API_ENDPOINTS,
  type ClientRow,
  type EndpointName,
  type ProfileRow,
} from '@smarteverything/domain';
import type { OperatingContext } from '../../src/extensions/mcp/tools/acting';
import type {
  Selection,
  SelectedToolDefinition,
} from '../../src/extensions/mcp/tools/selected-tool';
import type { Caller } from '../../src/server/auth';
import type { SeededStore } from '../support/store';

export interface Call {
  readonly name: EndpointName;
  readonly caller: Caller;
  readonly params: Record<string, string>;
  readonly query: Record<string, unknown>;
  readonly body: unknown;
}

export type Answers = Partial<Record<EndpointName, (call: Call) => unknown>>;

export interface RigSources {
  readonly store: () => SeededStore;
  readonly record: (call: Call) => void;
  readonly answers: () => Answers;
}

export function operatingContext(
  sources: RigSources,
  client: ClientRow,
  profile: ProfileRow,
): OperatingContext {
  return {
    store: sources.store(),
    caller: null,
    actor: { clientId: client.id, profileId: profile.id, chatId: null },
    operations: {
      run: (name, caller, input): Promise<unknown> => {
        API_ENDPOINTS[name].params.parse(input.params ?? {});
        const call = {
          name,
          caller,
          params: input.params ?? {},
          query: input.query ?? {},
          body: input.body,
        };
        sources.record(call);
        return Promise.resolve(sources.answers()[name]?.(call) ?? { ok: true });
      },
    },
  };
}

export function selected(definition: SelectedToolDefinition, key: string): Selection {
  const found = definition.selections[key];
  if (found === undefined) throw new Error(`no selection ${key}`);
  return found;
}
