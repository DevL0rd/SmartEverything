import { AUDIO_CHANGE, DISPLAY_CHANGE, JSON_VALUE } from '@smarteverything/domain';
import type { JsonValue, PluginOrigin, ReachTarget } from '@smarteverything/domain';
import type { NodeResult, Outputs } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import { resolveTarget } from '../device-groups/commands';
import type { Clock } from '../clock';
import type { EventRouter } from '../state/event-router';
import type { Store } from '../store/store';
import type { ActionOrigin, AutomationAiSlot } from './automation-ai';
import type { AutomationComputersSlot } from './automation-computers';
import { wakeAssistant } from './effects/ai-wake';
import { ComputerEffects } from './effects/computer';
import { runDeviceOperation } from './effects/device-operation';
import type { EffectHandler, EffectHandlers, EffectRun } from './effects/effect-run';
import { Notifier } from './effects/notify';
import type { QuestionDesk } from './questions/desk';
import { callTool } from './effects/tool';
import { PERSON_REF, TARGET_VALUE, personRefs } from './world-v3/refs';
import { effectFailure } from './effect-failure';

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

const FEED = z.object({ message: z.string() });
const NOTIFY_PERSON = z.object({
  people: z.array(PERSON),
  title: z.string(),
  body: z.string(),
  priority: z.enum(['normal', 'high', 'urgent']).default('normal'),
});
const SPEAK = z.object({ target: TARGET_VALUE, text: z.string().min(1) });
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
const AUDIO = z.object({ computer: z.string().min(1), change: AUDIO_CHANGE });
const DISPLAY = z.object({
  computer: z.string().min(1),
  change: DISPLAY_CHANGE,
  keep: z.boolean().default(false),
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

function reachTargets(store: Store, target: z.infer<typeof TARGET_VALUE>): ReachTarget[] {
  return resolveTarget(store, target).map((device) => ({ kind: 'device', deviceId: device.id }));
}

function handle<T>(
  schema: z.ZodType<T>,
  work: (data: T, run: EffectRun) => Promise<Outputs> | Outputs,
): EffectHandler {
  return async (params, _request, run) => {
    const checked = schema.safeParse(params);
    if (!checked.success) return invalid(checked.error);
    try {
      return { ok: true, value: await work(checked.data, run) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
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
          tool: 'notify_person',
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

function notifyHandlers(ports: HubEffectPorts): EffectHandlers {
  return {
    'notify.ask': askHandler(ports),
    'notify.feed': handle(FEED, ({ message }, run) => {
      const who = whoOf(ports, run);
      notifier(ports).feed({ automationId: run.automationId, name: who.name }, message);
      return {};
    }),
    'notify.person': handle(NOTIFY_PERSON, async (request, run) => {
      const who = whoOf(ports, run);
      const result = await notifier(ports).person(
        {
          people: request.people,
          title: request.title,
          body: request.body,
          priority: request.priority,
          asProfileId: who.profileId,
        },
        who,
      );
      return { sent: personRefs(result.sent), failed: personRefs(result.failed) };
    }),
    'notify.speak': handle(SPEAK, async (request, run) => {
      const who = whoOf(ports, run);
      const spokenOn: string[] = [];
      for (const target of reachTargets(ports.store, request.target)) {
        const spoken = await notifier(ports).speak(
          { target, text: request.text, asProfileId: who.profileId },
          who,
        );
        spokenOn.push(...spoken.spokenOn);
      }
      return { ok: spokenOn.length > 0, spokenOn };
    }),
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

function computerHandlers(ports: HubEffectPorts): EffectHandlers {
  const computers = new ComputerEffects(ports.computers);
  return {
    'computer.audio': handle(AUDIO, async (request, run) => {
      await computers.audio(request, run);
      return { ok: true };
    }),
    'computer.display': handle(DISPLAY, async (request, run) => {
      await computers.display(request, run);
      return { ok: true };
    }),
  };
}

export function hubEffectHandlers(ports: HubEffectPorts): EffectHandlers {
  return { ...notifyHandlers(ports), ...aiHandlers(ports), ...computerHandlers(ports) };
}
