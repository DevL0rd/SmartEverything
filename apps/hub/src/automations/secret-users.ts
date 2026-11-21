import {
  programReferences,
  type AutomationV3,
  type FunctionV3,
  type NodeKindLookup,
  type ReferenceContext,
  type StoredAutomationRow,
} from '@smarteverything/domain';
import type { StoreHost } from '../store/host/host';
import { flatAutomation } from '../store/repositories/automation-trees';
import type { FunctionPin } from './automation-units';
import type { SecretUsers } from './secrets-v3';

function programsOf(row: StoredAutomationRow): readonly AutomationV3[] {
  const programs = row.draft === null ? [row.definition] : [row.definition, row.draft.program];
  return programs.map(flatAutomation);
}

function pinKey(id: string, pin: number | null): string {
  return `${id}@${pin === null ? 'latest' : String(pin)}`;
}

export function secretUsers(host: StoreHost, kinds: NodeKindLookup): SecretUsers {
  return async (secretId) => {
    const rows = await host.call('automations', 'list');
    const bodies = new Map<string, FunctionV3 | null>();
    for (;;) {
      const missing = new Map<string, FunctionPin>();
      const context: ReferenceContext = {
        kinds: (id) => kinds.get(id),
        functions: (id, revision): FunctionV3 | undefined => {
          const pin = revision ?? null;
          const key = pinKey(id, pin);
          const body = bodies.get(key);
          if (body === undefined) {
            missing.set(key, { id, pin });
            return undefined;
          }
          return body ?? undefined;
        },
      };
      const users = rows
        .filter((row) =>
          programsOf(row).some((program) => programReferences(program, secretId, context)),
        )
        .map((row) => ({ automationId: row.id, name: row.name }));
      if (missing.size === 0) return users;
      const fetched = await host.read('automationFunctionBodies', [...missing.values()]);
      for (const found of fetched) bodies.set(pinKey(found.id, found.pin), found.body);
    }
  };
}
