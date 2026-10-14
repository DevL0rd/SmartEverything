import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import type { HarnessRuntimeEvent } from '../host/events';
import type { HarnessRuntimeRequest } from '@smarteverything/domain';
import type { HarnessControlPersistence } from './contracts';
import { HarnessRuntimeError } from '../host/errors';

export type HarnessOpenRequest = Extract<HarnessRuntimeRequest, { kind: 'open' }>;
export interface HarnessModelStreamEvent {
  readonly session_id: string;
  readonly epoch: number;
  readonly runtime_instance: string;
  readonly generation: string;
  readonly route: HarnessOpenRequest['route'];
  readonly frame: AssistantStreamFrame;
}
export class ProcessStreams {
  private readonly log = new Logger('hub.harness');
  private readonly listeners = new Set<
    (event: Extract<HarnessRuntimeEvent, { kind: 'stream' }>) => void
  >();
  constructor(
    private readonly persistence: HarnessControlPersistence,
    private readonly opened: ReadonlyMap<string, HarnessOpenRequest>,
  ) {}
  async observe(
    input: { readonly session_id: string; readonly expected_epoch: number },
    listener: (event: HarnessModelStreamEvent) => void,
  ): Promise<() => void> {
    const checked = z
      .strictObject({ session_id: z.string().min(1).max(200), expected_epoch: z.int().positive() })
      .parse(input);
    const claim = await this.persistence.verify(this.persistence.claim(checked.session_id));
    if (claim.epoch !== checked.expected_epoch)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Native stream observation names another writer epoch.',
      );
    const observe = (event: Extract<HarnessRuntimeEvent, { kind: 'stream' }>): void => {
      const open = this.opened.get(checked.session_id);
      if (event.sessionId !== checked.session_id || open?.claim.epoch !== checked.expected_epoch)
        return;
      listener({
        session_id: event.sessionId,
        epoch: open.claim.epoch,
        runtime_instance: open.claim.runtime_instance,
        generation: open.claim.connection_generation,
        route: open.route,
        frame: event.frame,
      });
    };
    this.listeners.add(observe);
    return (): void => {
      this.listeners.delete(observe);
    };
  }
  event(event: Extract<HarnessRuntimeEvent, { kind: 'stream' }>): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (cause) {
        this.listeners.delete(listener);
        this.log.error('stream-observer.failed', cause, { session_id: event.sessionId });
      }
    }
  }
}
