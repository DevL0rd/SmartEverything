import {
  AUTOMATION_RUN_POLICY,
  CAPABILITY_KEY,
  CLOCK_TIME,
  COMPARISON,
  EVENT_KINDS,
  PLUGIN_ORIGIN,
  SIGNAL_TRIGGER,
  SPEECH_TRIGGER,
  SUN_EVENTS,
  WEATHER_TRIGGERS,
  WEEKDAYS,
} from '@smarteverything/domain';
import { z } from 'zod';
import { ACTION, validateActionTree } from './v1-actions';
import { CONDITIONS } from './v1-conditions';

const TRIGGER_CONTENT = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('state'),
    deviceId: z.uuid(),
    capability: CAPABILITY_KEY,
    comparison: COMPARISON,
  }),
  z.object({ type: z.literal('event'), deviceId: z.uuid().nullable(), kind: z.enum(EVENT_KINDS) }),
  z.object({ type: z.literal('time'), at: CLOCK_TIME, weekdays: WEEKDAYS }),
  z.object({
    type: z.literal('sun'),
    event: z.enum(SUN_EVENTS),
    offsetMinutes: z.number().int().min(-720).max(720),
  }),
  z.object({ type: z.literal('interval'), everyMinutes: z.number().int().min(1).max(10_080) }),
  ...WEATHER_TRIGGERS,
  SIGNAL_TRIGGER,
  SPEECH_TRIGGER,
]);

const TRIGGER = TRIGGER_CONTENT.and(
  z.object({ nodeId: z.uuid().brand<'AutomationNodeId'>().optional() }),
);
export type Trigger = z.infer<typeof TRIGGER>;

export const AUTOMATION_DEFINITION = z
  .object({
    triggers: z.array(TRIGGER).min(1),
    conditions: CONDITIONS,
    actions: z.array(ACTION).min(1),
    origin: PLUGIN_ORIGIN.nullable().default(null),
    runPolicy: AUTOMATION_RUN_POLICY.optional(),
    controlKey: z.string().trim().min(1).max(100).optional(),
  })
  .superRefine((definition, context) => {
    validateActionTree(
      definition.actions,
      context,
      definition.triggers.map((trigger) => trigger.nodeId),
    );
  });

export type AutomationDefinition = z.infer<typeof AUTOMATION_DEFINITION>;
