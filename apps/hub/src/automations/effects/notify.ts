import { JSON_VALUE, type JsonValue, type ReachTarget } from '@smarteverything/domain';
import { z } from 'zod';
import type { ToolHub } from '../../ai-tools/tool-hub';
import type { Clock } from '../../clock';
import type { EventRouter } from '../../state/event-router';
import { callTool, ToolActionError, type ToolOrigin } from './tool';

export interface NotifyPorts {
  readonly events: Pick<EventRouter, 'record'>;
  readonly clock: Pick<Clock, 'now'>;
  readonly tools: Pick<ToolHub, 'check' | 'call'>;
}

export interface NotifyOrigin extends ToolOrigin {
  readonly automationId: string;
  readonly name: string;
}

export interface NotifyPersonRequest {
  readonly people: readonly string[];
  readonly title: string;
  readonly body: string;
  readonly priority: 'normal' | 'high' | 'urgent';
  readonly image?: string;
  readonly tag?: string;
  readonly link?: string;
  readonly sound?: string;
  readonly asProfileId: string;
}

export interface NotifyPersonResult {
  readonly sent: readonly string[];
  readonly failed: readonly string[];
}

export interface SpeechStyle {
  readonly priority: 'queue' | 'interrupt';
  readonly volume?: number;
  readonly voice?: string;
}

export interface SpeakRequest extends SpeechStyle {
  readonly target: ReachTarget;
  readonly text: string;
  readonly asProfileId: string;
}

export interface SpeakEverywhereRequest extends SpeechStyle {
  readonly targets: readonly ReachTarget[];
  readonly text: string;
  readonly asProfileId: string;
}

export interface SpeakResult {
  readonly ok: true;
  readonly spokenOn: readonly string[];
}

const SPOKEN = z.looseObject({
  result: z.looseObject({ result: z.looseObject({ target_label: z.string() }) }),
});

function present(
  entries: Readonly<Record<string, JsonValue | undefined>>,
): Record<string, JsonValue> {
  const args: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) args[key] = value;
  }
  return args;
}

function personArgs(request: NotifyPersonRequest, personId: string): Record<string, JsonValue> {
  const text = request.body === '' ? request.title : `${request.title}\n${request.body}`;
  return present({
    personId,
    text,
    urgent: request.priority === 'urgent',
    image: request.image,
    tag: request.tag,
    link: request.link,
    sound: request.sound,
  });
}

function speakArgs(request: SpeakRequest): Record<string, JsonValue> {
  return present({
    target: JSON_VALUE.parse(request.target),
    text: request.text,
    priority: request.priority === 'queue' ? undefined : request.priority,
    volume: request.volume,
    voice: request.voice,
  });
}

export class Notifier {
  constructor(private readonly ports: NotifyPorts) {}

  feed(origin: Pick<NotifyOrigin, 'automationId' | 'name'>, message: string): void {
    this.ports.events.record({
      deviceId: null,
      kind: 'automation_run',
      occurredAt: this.ports.clock.now().toISOString(),
      details: { automationId: origin.automationId, name: origin.name, message },
    });
  }

  async person(request: NotifyPersonRequest, origin: ToolOrigin): Promise<NotifyPersonResult> {
    const sent: string[] = [];
    const failed: string[] = [];
    for (const personId of request.people) {
      try {
        await callTool(
          this.ports.tools,
          {
            profileId: request.asProfileId,
            tool: 'person_notify',
            args: personArgs(request, personId),
          },
          origin,
        );
        sent.push(personId);
      } catch (cause) {
        if (!(cause instanceof ToolActionError)) throw cause;
        failed.push(personId);
      }
    }
    return { sent, failed };
  }

  async speak(request: SpeakRequest, origin: ToolOrigin): Promise<SpeakResult> {
    const response = await callTool(
      this.ports.tools,
      {
        profileId: request.asProfileId,
        tool: 'voice_speak',
        args: speakArgs(request),
      },
      origin,
    );
    return { ok: true, spokenOn: [SPOKEN.parse(response).result.result.target_label] };
  }

  async speakAll(request: SpeakEverywhereRequest, origin: ToolOrigin): Promise<SpeakResult> {
    const { targets, ...rest } = request;
    const spoken = await Promise.all(
      targets.map((target) => this.speak({ ...rest, target }, origin)),
    );
    return { ok: true, spokenOn: spoken.flatMap((result) => result.spokenOn) };
  }
}
