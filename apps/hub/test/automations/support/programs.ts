import { randomUUID } from 'node:crypto';
import {
  API_ENDPOINTS,
  AUTOMATION_DEFINITION,
  AUTOMATION_NODE_ID,
  type Action,
  type AutomationV2,
  type CommandAction,
  type AutomationNodeId,
  type Conditions,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { legacyAutomation } from '../../support/legacy-automation';
import type { Rig } from './rig';

type Definition = z.input<typeof AUTOMATION_DEFINITION>;
type Legacy = z.output<typeof AUTOMATION_DEFINITION>;
export type Triggers = Definition['triggers'];
export type Step = Action;
export type Steps = Action[];
export type { Conditions };

const NO_CONDITIONS: Conditions = { mode: 'all', items: [] };

export interface Program {
  readonly triggers?: Triggers;
  readonly conditions?: Conditions;
  readonly actions: Steps;
  readonly runPolicy?: Definition['runPolicy'];
  readonly controlKey?: string;
}

const MANUAL_ONLY: Triggers = [{ type: 'interval', everyMinutes: 10_080 }];

export function nodeId(): AutomationNodeId {
  return AUTOMATION_NODE_ID.parse(randomUUID());
}

function legacyOf(program: Program): Legacy {
  return AUTOMATION_DEFINITION.parse({
    triggers: program.triggers ?? MANUAL_ONLY,
    conditions: program.conditions ?? NO_CONDITIONS,
    actions: program.actions,
    ...(program.runPolicy === undefined ? {} : { runPolicy: program.runPolicy }),
    ...(program.controlKey === undefined ? {} : { controlKey: program.controlKey }),
  });
}

function v2Of(program: Program): AutomationV2 {
  return legacyAutomation(legacyOf(program));
}

export const definitionOf = v2Of;

export async function createAutomation(
  rig: Rig,
  name: string,
  program: Program,
  enabled = true,
): Promise<z.output<typeof API_ENDPOINTS.createAutomation.response>> {
  const row = await rig.request(API_ENDPOINTS.createAutomation, {
    body: { name, enabled, definition: definitionOf(program) },
  });
  await rig.settle();
  return row;
}

export function setPower(deviceId: string, value: boolean): CommandAction {
  return { type: 'command', deviceId, capability: 'power', value };
}

export function setBrightness(deviceId: string, value: number): CommandAction {
  return { type: 'command', deviceId, capability: 'brightness', value };
}
