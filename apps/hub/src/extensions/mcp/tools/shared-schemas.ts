import {
  ASSISTANT_VOICE_CHANGE,
  AUTOMATION_V3,
  CLAUDE_CLI_OPTIONS,
  ENGINE_REQUEST,
  FUNCTION_V3,
  LAYOUT,
  PHONE_ACTION,
  PROVIDER_ANSWER,
  PROGRAM_V3,
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
      'The AI engine by kind: openrouter with an optional model and effort, or claude, codex or dsh on a computer (device_id from device_find) with their model and settings',
  },
  {
    name: 'automation_program',
    schema: AUTOMATION_V3,
    type: 'object',
    summary:
      'An automation program: triggers, nodes and wires, as automation_read view full returns it',
  },
  {
    name: 'program',
    schema: PROGRAM_V3,
    type: 'object',
    summary: 'An automation or Custom Node program (kind automation or function)',
  },
  {
    name: 'custom_node_program',
    schema: FUNCTION_V3,
    type: 'object',
    summary: 'A Custom Node program: its interface, nodes and wires',
  },
  {
    name: 'automation_layout',
    schema: LAYOUT,
    type: 'object',
    summary: 'Where the editor draws each node; leave out to keep or derive it',
  },
  {
    name: 'claude_cli_settings',
    schema: CLAUDE_CLI_OPTIONS,
    type: 'object',
    summary:
      'Optional Claude CLI chat settings beyond cwd and permissionMode: thinking, fast mode, budget, extra directories, agent and the other Claude engine settings',
  },
  {
    name: 'claude_answer',
    schema: PROVIDER_ANSWER,
    type: 'object',
    summary:
      'The answer to a waiting Claude prompt by decision: allow or deny a permission, answers to a question, or a plan decision',
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
