import { Logger, background } from '@smarteverything/logging';
import { ApiError, DSH_SESSION_ID, HARNESS_NATIVE_FRAME } from '@smarteverything/domain';
import type {
  AiHarnessInteraction,
  AiHarnessPermission,
  AiHarnessSession,
  DshWriterClaim,
  HarnessNativeFrame,
} from '@smarteverything/domain';
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { HarnessRuntimeEvent } from '../host/events';
import { isProjectedType } from '../reducer';
import { streamFrame } from './native-frames';
import type { NativeFrameBody } from './native-frames';

type Work = AiHarnessSession['work'];

const STATUS_TYPES: ReadonlySet<string> = new Set([
  'command/done',
  'compaction/end',
  'job/registered',
  'job/settled',
]);

function streamBodies(frame: AssistantStreamFrame): readonly NativeFrameBody[] {
  const body = streamFrame(frame);
  return body === undefined ? [] : [body];
}

export class NativeForward {
  private readonly epochs = new Map<string, number>();
  private readonly tails = new Map<string, Promise<boolean>>();
  private readonly inputOutcomes = new Map<
    string,
    { readonly turn: number; readonly settled: Promise<boolean> }
  >();
  private readonly refusals = new Map<string, ApiError>();
  private readonly log = new Logger('hub.harness');
  private sealed = false;
  idle: (id: string) => Promise<void> = () => Promise.resolve();
  workFor: (id: string) => Work = () => [];

  constructor(
    private readonly publish: (frame: HarnessNativeFrame) => Promise<void>,
    private readonly interactionsFor: (id: string) => readonly AiHarnessInteraction[],
  ) {}

  seal(): void {
    if (this.sealed) return;
    this.sealed = true;
    this.log.info('publication.sealed', { open: this.epochs.size });
  }

  async open({ claim }: { readonly claim: DshWriterClaim }): Promise<void> {
    const id = claim.session_id;
    if (this.sealed) {
      this.log.warn('publication.open_refused', { session_id: id, epoch: claim.epoch });
      return;
    }
    await this.flush(id);
    this.epochs.set(id, claim.epoch);
    await this.publish(this.frame(id, { kind: 'open' }));
  }

  event(event: HarnessRuntimeEvent): void {
    const settled = this.enqueue(event.sessionId, () => this.bodies(event));
    if (event.kind !== 'input') return;
    const prior = this.inputOutcomes.get(event.sessionId);
    const current = settled ?? Promise.resolve(false);
    this.inputOutcomes.set(event.sessionId, {
      turn: event.turn,
      settled:
        prior?.turn === event.turn
          ? Promise.all([prior.settled, current]).then((outcomes) => outcomes.every(Boolean))
          : current,
    });
  }

  settledInput(sessionId: string, turn: number): Promise<boolean> {
    const input = this.inputOutcomes.get(sessionId);
    return input?.turn === turn ? input.settled : Promise.resolve(false);
  }

  interaction = (id: string, interaction: AiHarnessInteraction | null): void => {
    const interactions = [...this.interactionsFor(id)];
    background(
      this.enqueue(id, () =>
        Promise.resolve([{ kind: 'interactions', interactions, added: interaction }]),
      ),
      'publication.failed',
      { session_id: id },
    );
  };

  workspace(
    id: string,
    binding: Extract<NativeFrameBody, { kind: 'workspace' }>['storage_binding'],
  ): void {
    background(
      this.enqueue(id, () => Promise.resolve([{ kind: 'workspace', storage_binding: binding }])),
      'publication.failed',
      { session_id: id },
    );
  }

  permission(id: string, operationId: string, permission: AiHarnessPermission): void {
    background(
      this.enqueue(id, () =>
        Promise.resolve([{ kind: 'permission', operation_id: operationId, permission }]),
      ),
      'publication.failed',
      { session_id: id },
    );
  }

  async flush(id?: string): Promise<void> {
    const tails = id === undefined ? [...this.tails.values()] : [this.tails.get(id)];
    await Promise.all(tails.flatMap((tail) => (tail === undefined ? [] : [tail])));
  }

  openIds(): readonly string[] {
    return [...this.epochs.keys()];
  }

  async admit(id: string): Promise<void> {
    await this.flush(id);
    const refusal = this.refusals.get(id);
    if (refusal !== undefined) throw refusal;
  }

  close(id: string): void {
    if (!this.epochs.has(id)) return;
    background(
      this.enqueue(id, () => Promise.resolve([{ kind: 'close' }])),
      'publication.failed',
      { session_id: id },
    );
    this.epochs.delete(id);
    this.refusals.delete(id);
    this.inputOutcomes.delete(id);
  }

  private enqueue(
    id: string,
    produce: () => Promise<readonly NativeFrameBody[]>,
  ): Promise<boolean> | undefined {
    const epoch = this.epochs.get(id);
    if (epoch === undefined) return;
    const tail = (this.tails.get(id) ?? Promise.resolve()).then(() =>
      this.deliver(id, epoch, produce),
    );
    this.tails.set(id, tail);
    return tail;
  }

  private async deliver(
    id: string,
    epoch: number,
    produce: () => Promise<readonly NativeFrameBody[]>,
  ): Promise<boolean> {
    try {
      for (const body of await produce()) await this.publish(this.frame(id, body, epoch));
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'command_refused')
        this.refusals.set(id, cause);
      else this.log.error('publication.failed', cause, { session_id: id });
      return false;
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
    if (!STATUS_TYPES.has(record.type)) return [];
    const running = this.workFor(id).some((entry) => entry.kind === 'turn');
    return [await this.status(id, running ? 'running' : 'idle')];
  }

  private async status(id: string, status: 'idle' | 'running'): Promise<NativeFrameBody> {
    if (status === 'idle') await this.idle(id);
    return { kind: 'status', status, work: [...this.workFor(id)] };
  }
}
