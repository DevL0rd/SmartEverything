import { Logger } from '@smarteverything/logging';
import { ApiError, DSH_SESSION_ID, HARNESS_NATIVE_FRAME } from '@smarteverything/domain';
import type {
  AiHarnessInteraction,
  AiHarnessPermission,
  AiHarnessSession,
  HarnessNativeFrame,
  HarnessRuntimeRequest,
} from '@smarteverything/domain';
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { HarnessRuntimeEvent } from '../host/events';
import { isProjectedType } from '../reducer';
import { streamFrame } from './native-frames';
import type { NativeFrameBody } from './native-frames';

type Work = AiHarnessSession['work'];

function streamBodies(frame: AssistantStreamFrame): readonly NativeFrameBody[] {
  const body = streamFrame(frame);
  return body === undefined ? [] : [body];
}

export class NativeForward {
  private readonly epochs = new Map<string, number>();
  private readonly tails = new Map<string, Promise<void>>();
  private readonly refusals = new Map<string, ApiError>();
  private readonly log = new Logger('hub.harness');
  idle: (id: string) => Promise<void> = () => Promise.resolve();
  workFor: (id: string) => Work = () => [];

  constructor(
    private readonly publish: (frame: HarnessNativeFrame) => Promise<void>,
    private readonly interactionsFor: (id: string) => readonly AiHarnessInteraction[],
  ) {}

  async open(input: Extract<HarnessRuntimeRequest, { kind: 'open' }>): Promise<void> {
    const id = input.claim.session_id;
    await this.flush(id);
    this.epochs.set(id, input.claim.epoch);
    await this.publish(this.frame(id, { kind: 'open' }));
  }

  event(event: HarnessRuntimeEvent): void {
    this.enqueue(event.sessionId, () => this.bodies(event));
  }

  interaction = (id: string, interaction: AiHarnessInteraction | null): void => {
    const interactions = [...this.interactionsFor(id)];
    this.enqueue(id, () =>
      Promise.resolve([{ kind: 'interactions', interactions, added: interaction }]),
    );
  };

  workspace(
    id: string,
    binding: Extract<NativeFrameBody, { kind: 'workspace' }>['storage_binding'],
  ): void {
    this.enqueue(id, () => Promise.resolve([{ kind: 'workspace', storage_binding: binding }]));
  }

  permission(id: string, operationId: string, permission: AiHarnessPermission): void {
    this.enqueue(id, () =>
      Promise.resolve([{ kind: 'permission', operation_id: operationId, permission }]),
    );
  }

  async flush(id?: string): Promise<void> {
    const tails = id === undefined ? [...this.tails.values()] : [this.tails.get(id)];
    await Promise.all(tails.flatMap((tail) => (tail === undefined ? [] : [tail])));
  }

  async admit(id: string): Promise<void> {
    await this.flush(id);
    const refusal = this.refusals.get(id);
    if (refusal !== undefined) throw refusal;
  }

  close(id: string): void {
    if (!this.epochs.has(id)) return;
    this.enqueue(id, () => Promise.resolve([{ kind: 'close' }]));
    this.epochs.delete(id);
    this.refusals.delete(id);
  }

  private enqueue(id: string, produce: () => Promise<readonly NativeFrameBody[]>): void {
    const epoch = this.epochs.get(id);
    if (epoch === undefined) return;
    const tail = (this.tails.get(id) ?? Promise.resolve()).then(() =>
      this.deliver(id, epoch, produce),
    );
    this.tails.set(id, tail);
  }

  private async deliver(
    id: string,
    epoch: number,
    produce: () => Promise<readonly NativeFrameBody[]>,
  ): Promise<void> {
    try {
      for (const body of await produce()) await this.publish(this.frame(id, body, epoch));
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'command_refused')
        this.refusals.set(id, cause);
      else this.log.error('publication.failed', cause, { session_id: id });
    }
  }

  private frame(
    id: string,
    body: NativeFrameBody,
    epoch = this.epochs.get(id),
  ): HarnessNativeFrame {
    return HARNESS_NATIVE_FRAME.parse({ session_id: DSH_SESSION_ID.parse(id), epoch, ...body });
  }

  private async bodies(event: HarnessRuntimeEvent): Promise<readonly NativeFrameBody[]> {
    const id = event.sessionId;
    switch (event.kind) {
      case 'session':
        return this.sessionBodies(id, event.event);
      case 'input':
        return [{ kind: 'input', message_id: event.messageId, turn: event.turn }];
      case 'discarded':
        await this.idle(id);
        return [{ kind: 'discarded', message_id: event.messageId }];
      case 'stream':
        return streamBodies(event.frame);
      case 'status':
        return [await this.status(id, event.status)];
      case 'commands':
        return [{ kind: 'commands', revision: event.revision }];
      case 'context':
        return [{ kind: 'context', estimate: event.estimate }];
      case 'error':
        return [{ kind: 'error', message: event.failure.message }];
    }
  }

  private async sessionBodies(
    id: string,
    record: SessionEvent,
  ): Promise<readonly NativeFrameBody[]> {
    if (record.type === 'turn/start') this.refusals.delete(id);
    if (isProjectedType(record.type)) await this.idle(id);
    if (record.type !== 'command/done' && record.type !== 'compaction/end') return [];
    const running = this.workFor(id).some((entry) => entry.kind === 'turn');
    return [await this.status(id, running ? 'running' : 'idle')];
  }

  private async status(id: string, status: 'idle' | 'running'): Promise<NativeFrameBody> {
    if (status === 'idle') await this.idle(id);
    return { kind: 'status', status, work: [...this.workFor(id)] };
  }
}
