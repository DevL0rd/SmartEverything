import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';

const SESSION = z.string().min(1).max(200);

const BASE = {
  session_id: SESSION,
  cwd: z.string().max(4096).optional(),
  permission_mode: z.string().max(100).optional(),
};

const TOOL = {
  tool_name: z.string().min(1).max(200),
  tool_input: z.record(z.string(), JSON_VALUE).default({}),
};

export const HOOK_INPUT = z.discriminatedUnion('hook_event_name', [
  z.looseObject({
    ...BASE,
    hook_event_name: z.literal('Stop'),
    last_assistant_message: z.string().max(100_000).optional(),
  }),
  z.looseObject({
    ...BASE,
    hook_event_name: z.literal('UserPromptSubmit'),
    prompt: z.string().max(200_000),
  }),
  z.looseObject({ ...BASE, hook_event_name: z.literal('PermissionRequest'), ...TOOL }),
  z.looseObject({ ...BASE, hook_event_name: z.literal('PreToolUse'), ...TOOL }),
]);

export const OBSERVED_INPUT = z.discriminatedUnion('hook_event_name', [
  z.looseObject({ ...BASE, hook_event_name: z.literal('SessionStart') }),
  z.looseObject({
    ...BASE,
    hook_event_name: z.literal('Notification'),
    notification_type: z.string().max(100).optional(),
  }),
  z.looseObject({ ...BASE, hook_event_name: z.literal('Stop') }),
]);

export const FLOOR_INPUT = z.looseObject({
  ...BASE,
  hook_event_name: z.literal('PreToolUse'),
  ...TOOL,
});

export type ObservedInput = z.output<typeof OBSERVED_INPUT>;

export type FloorInput = z.output<typeof FLOOR_INPUT>;

export type HookInput = z.output<typeof HOOK_INPUT>;

export type HookOutput = Readonly<Record<string, JsonValue>>;

export const NO_ANSWER: HookOutput = {};

export const MOD_REPORT = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('result'),
    session_id: SESSION,
    request_id: z.string().min(1).max(100),
    ok: z.boolean(),
    error: z.string().max(1000).optional(),
    value: JSON_VALUE.optional(),
  }),
  z.strictObject({
    kind: z.literal('usage'),
    session_id: SESSION,
    windows: z
      .array(
        z.strictObject({
          key: z.string().min(1).max(100),
          used_percent: z.number().min(0).max(1000),
        }),
      )
      .max(20),
  }),
]);

export type ModReport = z.output<typeof MOD_REPORT>;

export type ModAction =
  | { readonly op: 'send'; readonly text: string }
  | { readonly op: 'interrupt' }
  | { readonly op: 'usage' }
  | { readonly op: 'tools' }
  | { readonly op: 'tool'; readonly name: string; readonly arguments: Record<string, JsonValue> };
