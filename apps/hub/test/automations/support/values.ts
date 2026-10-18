import {
  API_ENDPOINTS,
  AUTOMATION_VALUE_ID,
  type AutomationBindingKind,
  type AutomationInput,
  type AutomationValueContent,
  type AutomationValueRow,
} from '@smarteverything/domain';
import { nodeId, type Step } from './programs';
import type { Rig } from './rig';

export async function createValue(
  rig: Rig,
  content: AutomationValueContent,
): Promise<AutomationValueRow> {
  return rig.request(API_ENDPOINTS.createAutomationValue, { body: { content } });
}

export async function numberValue(
  rig: Rig,
  name: string,
  value: number,
  bounds: Partial<Extract<AutomationValueContent, { kind: 'number' }>['bounds']> = {},
): Promise<AutomationValueRow> {
  return createValue(rig, {
    kind: 'number',
    name,
    value,
    bounds: { overflow: 'reject', ...bounds },
  });
}

export function fromValue(
  valueId: string,
  kind: AutomationBindingKind,
  offset?: AutomationInput['offset'],
): AutomationInput {
  return {
    binding: { source: 'value', kind, valueId: AUTOMATION_VALUE_ID.parse(valueId) },
    ...(offset === undefined ? {} : { offset }),
  };
}

export function fromDevice(
  deviceId: string,
  capability: 'brightness' | 'temperature',
  offset?: AutomationInput['offset'],
): AutomationInput {
  return {
    binding: { source: 'capability', kind: 'number', deviceId, capability },
    ...(offset === undefined ? {} : { offset }),
  };
}

export function boundCommand(
  deviceId: string,
  capability: 'brightness' | 'off_timer',
  input: AutomationInput,
): Step {
  return {
    type: 'command',
    nodeId: nodeId(),
    deviceId,
    capability,
    binding: { type: 'value', input },
  };
}
