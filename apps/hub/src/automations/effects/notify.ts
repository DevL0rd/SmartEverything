import { JSON_VALUE, type ReachTarget } from '@smarteverything/domain';
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
  readonly asProfileId: string;
}

export interface NotifyPersonResult {
  readonly sent: readonly string[];
  readonly failed: readonly string[];
}

export interface SpeakRequest {
  readonly target: ReachTarget;
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
    const text = request.body === '' ? request.title : `${request.title}\n${request.body}`;
    const sent: string[] = [];
    const failed: string[] = [];
    for (const personId of request.people) {
      try {
        await callTool(
          this.ports.tools,
          {
            profileId: request.asProfileId,
            tool: 'notify_person',
            args: { personId, text, urgent: request.priority === 'urgent' },
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
        tool: 'speak',
        args: { target: JSON_VALUE.parse(request.target), text: request.text },
      },
      origin,
    );
    return { ok: true, spokenOn: [SPOKEN.parse(response).result.result.target_label] };
  }
}
