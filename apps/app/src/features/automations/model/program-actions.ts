import { randomUUID } from 'expo-crypto';
import {
  AUTOMATION_NODE_ID,
  identifyActions,
  targetDevices,
  type Action,
  type AutomationNodeId,
  type AutomationSequenceRow,
  type AutomationValueRow,
  type DeviceTarget,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { groupControlChoices } from '../../device-groups';
import type { Catalog } from '../data/use-automations';
import { blankAction, ACTION_TYPES } from './blanks';
import { choicesOf } from '../editor/add-items';
import { ACTION_KINDS } from '../editor/kinds';
import { defaultOperation } from './value-content';
import { defaultValue } from './capability-choices';
import { literalInput } from './input-bindings';

export interface ProgramActionChoice {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
  readonly action: Action;
}
export function nodeId(): AutomationNodeId {
  return AUTOMATION_NODE_ID.parse(randomUUID());
}

function blankTarget(catalog: Catalog): Action | null {
  const targets: readonly DeviceTarget[] = [
    ...(catalog.groups ?? []).map((row) => ({ kind: 'group' as const, groupId: row.id })),
    ...(catalog.rooms ?? []).map((row) => ({ kind: 'room' as const, roomId: row.id })),
    ...catalog.devices.map((row) => ({ kind: 'devices' as const, deviceIds: [row.id] })),
  ];
  for (const target of targets) {
    const control = groupControlChoices(
      targetDevices(catalog.allDevices, catalog.groups ?? [], target),
    )[0];
    if (control === undefined) continue;
    return {
      type: 'target_command',
      nodeId: nodeId(),
      target,
      capability: control.reference,
      ...(control.presented.role === 'brightness' ? ({ scale: 'percent' } as const) : {}),
      value: defaultValue(control.presented.capability.value),
    };
  }
  return null;
}
export function sequenceAction(
  row: AutomationSequenceRow,
  existing?: Extract<Action, { type: 'sequence' }>,
): Extract<Action, { type: 'sequence' }> {
  return {
    type: 'sequence',
    nodeId: existing?.nodeId ?? nodeId(),
    sequenceId: row.id,
    parameters: Object.fromEntries(
      row.definition.parameters.map((parameter) => {
        const previous = existing?.parameters[parameter.name];
        return [
          parameter.name,
          previous?.binding.kind === parameter.kind ? previous : literalInput(parameter.kind),
        ];
      }),
    ),
  };
}
export function valueUpdateAction(
  row: AutomationValueRow,
): Extract<Action, { type: 'value_update' }> {
  return {
    type: 'value_update',
    nodeId: nodeId(),
    valueId: row.id,
    operation: defaultOperation(row.content),
  };
}
function blankSequence(catalog: Catalog): Action | null {
  const row = catalog.sequences?.[0];
  return row === undefined ? null : sequenceAction(row);
}
function blankUpdate(catalog: Catalog): Action | null {
  const row = catalog.values?.[0];
  return row === undefined ? null : valueUpdateAction(row);
}
const STRUCTURED_BUILDERS: Readonly<Record<string, (catalog: Catalog) => Action | null>> = {
  choose: () => ({
    type: 'choose',
    nodeId: nodeId(),
    branches: [{ nodeId: nodeId(), conditions: { mode: 'all', items: [] }, actions: [] }],
    otherwise: [],
  }),
  repeat: () => ({
    type: 'repeat',
    nodeId: nodeId(),
    repeat: { mode: 'count', count: 3 },
    maximumDurationMs: 60_000,
    intervalMs: 1000,
    actions: [{ type: 'delay', nodeId: nodeId(), seconds: 1 }],
  }),
  stop: () => ({ type: 'stop', nodeId: nodeId(), target: { type: 'current' } }),
  value_update: blankUpdate,
  sequence: blankSequence,
  target_command: blankTarget,
};
export const PROGRAM_LOOKS: Readonly<
  Record<Action['type'], { readonly label: string; readonly icon: IconName }>
> = {
  ...ACTION_KINDS,
  temporary_effect: { label: 'Temporary change', icon: 'timer' },
  target_command: { label: 'Control a group, room or devices', icon: 'grid' },
  choose: { label: 'Choose', icon: 'route' },
  repeat: { label: 'Repeat', icon: 'refresh' },
  sequence: { label: 'Call a sequence', icon: 'layers' },
  value_update: { label: 'Change a Value', icon: 'customize' },
  stop: { label: 'Stop', icon: 'square' },
};
export function programChoices(catalog: Catalog): readonly ProgramActionChoice[] {
  const legacy = ACTION_TYPES.flatMap((key) => {
    const action = blankAction(key, choicesOf(catalog));
    return action === null ? [] : [{ key, ...ACTION_KINDS[key], action }];
  });
  const structured = Object.entries(STRUCTURED_BUILDERS).flatMap(([key, build]) => {
    const action = build(catalog);
    return action === null ? [] : [{ key, ...PROGRAM_LOOKS[action.type], action }];
  });
  return [...legacy, ...structured].map((choice) => ({
    ...choice,
    action: identifyActions([choice.action], randomUUID)[0] ?? choice.action,
  }));
}
