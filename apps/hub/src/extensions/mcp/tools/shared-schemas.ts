import {
  AGENT_LOOPS_SETTING,
  ASSISTANT_VOICE_CHANGE,
  AUTOMATION_V4,
  ENGINE_REQUEST,
  FUNCTION_V4,
  LAYOUT,
  PHONE_ACTION,
  PLANNER_ALARM_CHANGES,
  PLANNER_ALARM_CREATE,
  PLANNER_ITEM_CHANGES,
  PLANNER_ITEM_CREATE,
  PLANNER_TIMER_START,
  PROGRAM_V4,
} from '@smarteverything/domain';
import { z } from 'zod';

export interface SharedSchema {
  readonly name: string;
  readonly schema: z.core.$ZodType;
  readonly type: 'object' | 'array';
  readonly summary: string;
}

export const SHARED_SCHEMAS: readonly SharedSchema[] = [
  {
    name: 'engine',
    schema: ENGINE_REQUEST,
    type: 'object',
    summary:
      'The AI engine by kind: dsh with an optional model and effort (left out, the hub’s default model on your own metered route), dsh on a computer through execution_target, or, for a helper agent, claude or codex on a computer (device_id from device_find) with their model and settings',
  },
  {
    name: 'automation_program',
    schema: AUTOMATION_V4,
    type: 'object',
    summary:
      'An automation program: triggers, nodes and wires; each node names the node that follows it in to, and one flow.start leads to the first step, as automation_read view full returns it',
  },
  {
    name: 'program',
    schema: PROGRAM_V4,
    type: 'object',
    summary:
      'An automation or Custom Node program (kind automation or function), as nodes and wires',
  },
  {
    name: 'custom_node_program',
    schema: FUNCTION_V4,
    type: 'object',
    summary:
      'A Custom Node program: its interface, nodes and wires, with one flow.start leading to the first step',
  },
  {
    name: 'automation_layout',
    schema: LAYOUT,
    type: 'object',
    summary: 'Where the editor draws each node; leave out to keep or derive it',
  },
  {
    name: 'phone_action',
    schema: PHONE_ACTION,
    type: 'object',
    summary:
      'One phone action by type: ring, flashlight, volume, ringer, do_not_disturb, brightness, screen_timeout, set_system_toggle, open_settings, media, dismiss_notification or receive_file',
  },
  {
    name: 'assistant_voice',
    schema: ASSISTANT_VOICE_CHANGE,
    type: 'object',
    summary:
      'Voice settings to change, only the fields given: voice, speech model, timing and call behaviour',
  },
  {
    name: 'agent_loop_settings',
    schema: AGENT_LOOPS_SETTING,
    type: 'object',
    summary:
      'Caps for the automatic work of the AI, only the groups and fields given: goal, ralph, workflow, code, subagents and workspace limits; unset uses the harness default',
  },
  {
    name: 'planner_item',
    schema: PLANNER_ITEM_CREATE,
    type: 'object',
    summary: 'A new planner task or event',
  },
  {
    name: 'planner_item_changes',
    schema: PLANNER_ITEM_CHANGES,
    type: 'object',
    summary: 'Planner item fields to change, only those given',
  },
  {
    name: 'planner_alarm',
    schema: PLANNER_ALARM_CREATE,
    type: 'object',
    summary: 'A new alarm',
  },
  {
    name: 'planner_alarm_changes',
    schema: PLANNER_ALARM_CHANGES,
    type: 'object',
    summary: 'Alarm fields to change, only those given',
  },
  {
    name: 'planner_timer',
    schema: PLANNER_TIMER_START,
    type: 'object',
    summary: 'A timer to start',
  },
];

const BY_SCHEMA: ReadonlyMap<z.core.$ZodType, SharedSchema> = new Map(
  SHARED_SCHEMAS.map((shared) => [shared.schema, shared]),
);

const BY_NAME: ReadonlyMap<string, SharedSchema> = new Map(
  SHARED_SCHEMAS.map((shared) => [shared.name, shared]),
);

export function sharedSchemaOf(schema: z.core.$ZodType): SharedSchema | undefined {
  return BY_SCHEMA.get(schema);
}

export function sharedSchemaNamedEntry(name: string): SharedSchema | undefined {
  return BY_NAME.get(name);
}

export function sharedSchemaNamed(name: string): Readonly<Record<string, unknown>> | undefined {
  const shared = BY_NAME.get(name);
  if (shared === undefined) {
    return undefined;
  }
  const json: Record<string, unknown> = z.toJSONSchema(shared.schema, {
    io: 'input',
    unrepresentable: 'any',
    cycles: 'ref',
  });
  delete json['$schema'];
  return json;
}

export function sharedReference(shared: SharedSchema): Record<string, unknown> {
  return {
    type: shared.type,
    description: `${shared.summary}. Exact schema: tool_read with name ${shared.name}.`,
  };
}
