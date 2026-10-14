import { z } from 'zod';
import { JSON_VALUE } from './values';

const POSITION = z
  .int()
  .nonnegative()
  .refine((value) => !Object.is(value, -0));
const TEXT = z.string().min(1);
const SOURCE = z.object({ kind: TEXT }).catchall(JSON_VALUE);
const FILE = z
  .object({ attachmentId: TEXT, name: z.string(), bytes: POSITION })
  .catchall(JSON_VALUE);
const DIMENSIONS = z
  .object({ width: z.number().positive(), height: z.number().positive() })
  .catchall(JSON_VALUE);
const IMAGE = DIMENSIONS.extend({
  attachmentId: TEXT,
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  bytes: POSITION,
  name: z.string().optional(),
  originalDimensions: DIMENSIONS.optional(),
});
const BLOCK_SCHEMAS: ReadonlyMap<string, z.ZodType> = new Map<string, z.ZodType>([
  ['text', z.object({ text: z.string() }).catchall(JSON_VALUE)],
  ['reasoning', z.object({ text: z.string() }).catchall(JSON_VALUE)],
  ['tool-call', z.object({ id: TEXT, name: TEXT, arguments: z.string() }).catchall(JSON_VALUE)],
  ['tool-addition', z.object({ toolName: TEXT, tool: z.never().optional() }).catchall(JSON_VALUE)],
  ['tool-removal', z.object({ toolName: TEXT }).catchall(JSON_VALUE)],
  [
    'image',
    z.object({ attachment: IMAGE, offloaded: z.literal(true).optional() }).catchall(JSON_VALUE),
  ],
  ['file', z.object({ attachment: FILE }).catchall(JSON_VALUE)],
]);
const BLOCK = z
  .object({ type: TEXT })
  .catchall(JSON_VALUE)
  .superRefine((value, context) => {
    const schema = BLOCK_SCHEMAS.get(value.type);
    if (schema === undefined) return;
    const result = schema.safeParse(value);
    if (!result.success)
      for (const issue of result.error.issues)
        context.addIssue({ ...issue, path: [...issue.path] });
  });
const MESSAGE = z
  .object({ id: TEXT, role: TEXT, source: SOURCE, content: z.array(BLOCK) })
  .catchall(JSON_VALUE);
const TURN_STEP = { turn: POSITION, step: POSITION };
const SETTLEMENT = z.object({ ...TURN_STEP, stream: z.array(JSON_VALUE) }).catchall(JSON_VALUE);
const PAIR = z.object({ provider: TEXT, model: TEXT }).catchall(JSON_VALUE);
const CONFIG = PAIR.extend({ reasoningEffort: TEXT.optional() });
const DEFAULTS = z
  .strictObject({
    reasoningEffort: z.literal(true).optional(),
    maxTokens: z.literal(true).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const REQUEST_HEADER = z
  .object({
    config: CONFIG,
    tools: z.array(z.record(z.string(), JSON_VALUE)).min(1).optional(),
    adapterDefaults: DEFAULTS.optional(),
    system: z.never().optional(),
  })
  .catchall(JSON_VALUE)
  .superRefine((value, context) => {
    for (const key of Object.keys(value.adapterDefaults ?? {})) {
      if (!Object.hasOwn(value.config, key))
        context.addIssue({
          code: 'custom',
          path: ['adapterDefaults', key],
          message: 'An adapter default must name a present config field.',
        });
    }
  });
const DATA_SCHEMAS: ReadonlyMap<string, z.ZodType> = new Map<string, z.ZodType>([
  ['turn/start', z.object({ turn: POSITION }).catchall(JSON_VALUE)],
  [
    'turn/end',
    z
      .object({ turn: POSITION, reason: z.object({ kind: TEXT }).catchall(JSON_VALUE) })
      .catchall(JSON_VALUE),
  ],
  ['step/start', z.object(TURN_STEP).catchall(JSON_VALUE)],
  ['step/end', z.object(TURN_STEP).catchall(JSON_VALUE)],
  [
    'tool/call',
    z
      .object({ ...TURN_STEP, callId: TEXT, name: TEXT, arguments: z.string() })
      .catchall(JSON_VALUE),
  ],
  ['tool/result', z.object({ ...TURN_STEP, message: MESSAGE }).catchall(JSON_VALUE)],
  ['user/message', MESSAGE],
  ['system/message', z.object({ ...TURN_STEP, message: MESSAGE }).catchall(JSON_VALUE)],
  [
    'developer/message',
    z
      .object({ ...TURN_STEP, message: MESSAGE, headerSeq: POSITION.optional() })
      .catchall(JSON_VALUE),
  ],
  ['assistant/message', SETTLEMENT.extend({ message: MESSAGE })],
  ['assistant/attempt', SETTLEMENT],
  [
    'request/header',
    z
      .object({
        header: REQUEST_HEADER,
        reason: z.enum(['initial', 'resume', 'change', 'series']),
        startsSeries: z.literal(true).optional(),
      })
      .catchall(JSON_VALUE),
  ],
  ['request/context', PAIR],
  ['session/end-seed', z.object({ inherited: z.literal(true).optional() }).catchall(JSON_VALUE)],
]);

export function dshCoreEventIssues(event: {
  readonly type: string;
  readonly data: unknown;
}): readonly z.core.$ZodIssue[] {
  const schema = DATA_SCHEMAS.get(event.type);
  if (schema === undefined) return [];
  const result = schema.safeParse(event.data);
  return result.success ? [] : result.error.issues;
}
