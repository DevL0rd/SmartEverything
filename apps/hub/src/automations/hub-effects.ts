import { JSON_VALUE } from '@smarteverything/domain';
import type { JsonValue, PluginOrigin, ReachTarget } from '@smarteverything/domain';
import type { EffectRequest, NodeResult, Outputs } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import { resolveTarget } from '../device-groups/commands';
import type { Clock } from '../clock';
import type { EventRouter } from '../state/event-router';
import type { Store } from '../store/store';
import type { ActionOrigin, AutomationAiSlot } from './automation-ai';
import type { AutomationComputersSlot } from './automation-computers';
import { wakeAssistant } from './effects/ai-wake';
import { modeOf } from './effects/action-mode';
import { deliver } from './effects/deliver';
import { runDeviceOperation } from './effects/device-operation';
import type { EffectHandler, EffectHandlers, EffectRun } from './effects/effect-run';
import { Notifier } from './effects/notify';
import type { QuestionDesk } from './questions/desk';
import { callTool } from './effects/tool';
import { PERSON_REF, TARGET_VALUE, personRefs } from './world-v3/refs';
import { effectFailure } from './effect-failure';
import { IntegrationError } from './effects/integration-error';

export interface HubEffectPorts {
  readonly store: Store;
  readonly clock: Pick<Clock, 'now'>;
  readonly events: Pick<EventRouter, 'record'>;
  readonly ai: AutomationAiSlot;
  readonly computers: AutomationComputersSlot;
  readonly questions: Pick<QuestionDesk, 'open' | 'close'>;
}

interface Who {
  readonly name: string;
  readonly profileId: string;
  readonly plugin: PluginOrigin | null;
}

const PERSON = z.union([z.string().min(1), PERSON_REF]);
const OPTIONAL_PERSON = PERSON.optional();

const OPTIONAL_TEXT = z
  .string()
  .nullish()
  .transform((text) =>
    text === null || text === undefined || text.trim() === '' ? undefined : text,
  );

const FEED = z.object({ message: z.string() });
const NOTIFY_PERSON = z.object({
  people: z.array(PERSON),
  title: z.string(),
  body: z.string(),
  priority: z.enum(['normal', 'high', 'urgent']).default('normal'),
  image: OPTIONAL_TEXT,
  tag: OPTIONAL_TEXT,
  link: OPTIONAL_TEXT,
  sound: OPTIONAL_TEXT,
});
const SPEAK = z.object({
  target: TARGET_VALUE.nullish(),
  channel: OPTIONAL_TEXT,
  text: z.string().min(1),
  priority: z.enum(['queue', 'interrupt']).default('queue'),
  volume: z.number().min(0).max(100).nullish(),
  voice: OPTIONAL_TEXT,
});
const ASK = z.object({
  person: PERSON,
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(4),
  timeout: z.number().int().min(1).optional(),
});
const WAKE = z.object({
  instruction: z.string().min(1),
  person: OPTIONAL_PERSON,
  chat: z.string().min(1).nullable().optional(),
});
const TOOL = z.object({
  tool: z.string().min(1),
  args: z.record(z.string(), JSON_VALUE).default({}),
  person: OPTIONAL_PERSON,
});
const OPERATION = z.object({
  operation: z.string().min(1),
  args: z.record(z.string(), JSON_VALUE).default({}),
});

function invalid(error: z.ZodError): NodeResult {
  return { ok: false, class: 'Invalid', message: z.prettifyError(error) };
}

function whoOf(ports: HubEffectPorts, run: EffectRun): Who {
  const row = ports.store.automations.find(run.automationId);
  return {
    name: row?.name ?? 'Automation',
    profileId: row?.author?.profile_id ?? ports.store.profiles.first().id,
    plugin: row?.origin ?? null,
  };
}

function originOf(who: Who, run: EffectRun): ActionOrigin {
  return {
    automationId: run.automationId,
    name: who.name,
    signal: run.trigger,
    plugin: who.plugin,
  };
}

function reachTargets(store: Store, request: z.infer<typeof SPEAK>): ReachTarget[] {
  const devices: ReachTarget[] =
    request.target === null || request.target === undefined
      ? []
      : resolveTarget(store, request.target).map((device) => ({
          kind: 'device',
          deviceId: device.id,
        }));
  return request.channel === undefined
    ? devices
    : [...devices, { kind: 'channel', channelId: request.channel }];
}

function handle<T>(
  schema: z.ZodType<T>,
  work: (data: T, run: EffectRun, request: EffectRequest) => Promise<Outputs> | Outputs,
): EffectHandler {
  return async (params, request, run) => {
    const checked = schema.safeParse(params);
    if (!checked.success) return invalid(checked.error);
    try {
      return { ok: true, value: await work(checked.data, run, request) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

async function delivered(
  request: EffectRequest,
  run: EffectRun,
  work: () => Promise<Outputs>,
): Promise<Outputs> {
  return (await deliver({ kind: request.kind, mode: modeOf(request), run, work })) ?? {};
}

function notifier(ports: HubEffectPorts): Notifier {
  return new Notifier({
    events: ports.events,
    clock: ports.clock,
    tools: {
      check: (...request) => ports.ai.current().tools.check(...request),
      call: (...request) => ports.ai.current().tools.call(...request),
    },
  });
}

function askLine(automation: string, question: string, options: readonly string[]): string {
  return `${automation} asks: ${question}\nAnswer ${options.join(' or ')} in the app under Automations, or tell the assistant.`;
}

function askHandler(ports: HubEffectPorts): EffectHandler {
  return async (params, request, run) => {
    const checked = ASK.safeParse(params);
    if (!checked.success) return invalid(checked.error);
    const ask = checked.data;
    const who = whoOf(ports, run);
    try {
      ports.questions.open({
        id: request.key,
        automationId: run.automationId,
        runId: run.runId,
        personId: ask.person,
        question: ask.question,
        options: ask.options,
        deadlineAt:
          ask.timeout === undefined
            ? null
            : new Date(ports.clock.now().getTime() + ask.timeout).toISOString(),
      });
      await callTool(
        ports.ai.current().tools,
        {
          profileId: who.profileId,
          tool: 'person_notify',
          args: { personId: ask.person, text: askLine(who.name, ask.question, ask.options) },
        },
        who,
      );
      return { ok: true, value: { notificationId: request.key } };
    } catch (cause) {
      ports.questions.close(request.key);
      return effectFailure(cause);
    }
  };
}

function personHandler(ports: HubEffectPorts): EffectHandler {
  return handle(NOTIFY_PERSON, (request, run, effect) => {
    const who = whoOf(ports, run);
    const { image, tag, link, sound } = request;
    return delivered(effect, run, async () => {
      const result = await notifier(ports).person(
        {
          people: request.people,
          title: request.title,
          body: request.body,
          priority: request.priority,
          ...(image === undefined ? {} : { image }),
          ...(tag === undefined ? {} : { tag }),
          ...(link === undefined ? {} : { link }),
          ...(sound === undefined ? {} : { sound }),
          asProfileId: who.profileId,
        },
        who,
      );
      return { sent: personRefs(result.sent), failed: personRefs(result.failed) };
    });
  });
}

function speakHandler(ports: HubEffectPorts): EffectHandler {
  return handle(SPEAK, (request, run, effect) => {
    const noDevices = request.target === null || request.target === undefined;
    if (noDevices && request.channel === undefined) {
      throw new IntegrationError('Invalid', 'Pick a device or a Talk channel to speak on.');
    }
    const targets = reachTargets(ports.store, request);
    const who = whoOf(ports, run);
    const { volume, voice } = request;
    return delivered(effect, run, async () => {
      const { spokenOn } = await notifier(ports).speakAll(
        {
          targets,
          text: request.text,
          priority: request.priority,
          ...(volume === null || volume === undefined ? {} : { volume }),
          ...(voice === undefined ? {} : { voice }),
          asProfileId: who.profileId,
        },
        who,
      );
      return { ok: spokenOn.length > 0, spokenOn };
    });
  });
}

function notifyHandlers(ports: HubEffectPorts): EffectHandlers {
  return {
    'notify.ask': askHandler(ports),
    'notify.feed': handle(FEED, ({ message }, run, effect) => {
      const who = whoOf(ports, run);
      return delivered(effect, run, () => {
        notifier(ports).feed({ automationId: run.automationId, name: who.name }, message);
        return Promise.resolve({});
      });
    }),
    'notify.person': personHandler(ports),
    'notify.speak': speakHandler(ports),
  };
}

function aiHandlers(ports: HubEffectPorts): EffectHandlers {
  return {
    'ai.wake': handle(WAKE, async (request, run) => {
      const who = whoOf(ports, run);
      await wakeAssistant(
        ports.ai,
        {
          profileId: request.person ?? who.profileId,
          chatId: request.chat ?? null,
          instruction: request.instruction,
        },
        originOf(who, run),
        run,
      );
      return {};
    }),
    'tool.call': handle(TOOL, async (request, run) => {
      const who = whoOf(ports, run);
      const result = await callTool(
        ports.ai.current().tools,
        {
          profileId: request.person ?? who.profileId,
          tool: request.tool,
          args: request.args,
        },
        who,
      );
      return { result, ok: true };
    }),
    'device.operation': handle(OPERATION, async (request, run) => {
      const who = whoOf(ports, run);
      const result: JsonValue = await runDeviceOperation(
        ports.ai.current().tools,
        { operation: request.operation, args: request.args, profileId: who.profileId },
        who,
      );
      return { result };
    }),
  };
}

export function hubEffectHandlers(ports: HubEffectPorts): EffectHandlers {
  return { ...notifyHandlers(ports), ...aiHandlers(ports) };
}
