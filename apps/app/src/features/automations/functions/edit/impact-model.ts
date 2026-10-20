import type { AutomationFunctionUser } from '@smarteverything/domain';
import {
  classifyInterfaceChange,
  type InterfaceChange,
} from '@smarteverything/flow/functions/compat';
import type { FunctionInterface } from '@smarteverything/flow/functions/interface-hash';

export type ImpactTone = 'unchanged' | 'compatible' | 'breaking';

export interface Impact {
  readonly tone: ImpactTone;
  readonly chip: string;
  readonly message: string;
  readonly changes: readonly InterfaceChange[];
}

function placesOf(users: readonly AutomationFunctionUser[]): string {
  const automations = users.filter((user) => user.kind === 'automation').length;
  const nodes = users.length - automations;
  const parts = [
    automations === 0
      ? null
      : `${String(automations)} ${automations === 1 ? 'automation' : 'automations'}`,
    nodes === 0 ? null : `${String(nodes)} ${nodes === 1 ? 'Custom Node' : 'Custom Nodes'}`,
  ].filter((part): part is string => part !== null);
  return parts.join(' and ');
}

function breakingMessage(changes: readonly InterfaceChange[]): string {
  const breaking = changes.filter((change) => change.compat === 'breaking');
  const [first] = breaking;
  const more = breaking.length - 1;
  const lead = first?.reason ?? 'The interface changed.';
  const tail =
    more > 0
      ? ` ${String(more)} more ${more === 1 ? 'change needs' : 'changes need'} mapping.`
      : '';
  return `This change needs mapping. ${lead}${tail} Choose what each caller uses instead when you publish.`;
}

export function impactOf(
  before: FunctionInterface,
  after: FunctionInterface,
  users: readonly AutomationFunctionUser[],
): Impact {
  const { result, changes } = classifyInterfaceChange(before, after);
  if (changes.length === 0) {
    return {
      tone: 'unchanged',
      chip: 'No change',
      message: 'The interface is unchanged.',
      changes,
    };
  }
  if (result === 'breaking') {
    return { tone: 'breaking', chip: 'Breaking', message: breakingMessage(changes), changes };
  }
  const places = placesOf(users);
  return {
    tone: 'compatible',
    chip: 'Compatible',
    message: places === '' ? 'Nothing uses this yet.' : `This change updates ${places}.`,
    changes,
  };
}
