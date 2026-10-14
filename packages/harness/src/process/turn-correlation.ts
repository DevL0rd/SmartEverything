import { z } from 'zod';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { HarnessRuntimeEvent } from '../host/events';
export interface NativeTurnIdentity {
  readonly delivery_id: string;
  readonly native_turn: number;
}
export class ProcessTurnCorrelation {
  private readonly ordinary = new Map<string, Set<string>>();
  private readonly current = new Map<string, NativeTurnIdentity>();
  record(id: string, event: SessionEvent): void {
    if (event.type === 'turn/start') this.current.delete(id);
    if (event.type === 'user/message') this.ordinary.get(id)?.delete(event.data.id);
    if (event.type !== 'agent/inbox/spliced' || event.data.target !== 'next-turn') return;
    const inputs = this.ordinary.get(id) ?? new Set<string>();
    for (const message of event.data.inserted)
      if (z.uuid().safeParse(message.id).success) inputs.add(message.id);
    this.ordinary.set(id, inputs);
  }
  claimed(event: Extract<HarnessRuntimeEvent, { kind: 'input' }>): boolean {
    if (this.ordinary.get(event.sessionId)?.has(event.messageId) !== true) return false;
    this.ordinary.get(event.sessionId)?.delete(event.messageId);
    this.current.set(event.sessionId, { delivery_id: event.messageId, native_turn: event.turn });
    return true;
  }
  discarded(id: string, messageId: string): boolean {
    return this.ordinary.get(id)?.delete(messageId) === true;
  }
  identity(id: string): NativeTurnIdentity | undefined {
    return this.current.get(id);
  }
  ended(id: string, turn: number): NativeTurnIdentity | undefined {
    const identity = this.current.get(id);
    if (identity?.native_turn !== turn) return undefined;
    return identity;
  }
  close(id: string): void {
    this.ordinary.delete(id);
    this.current.delete(id);
  }
  finish(id: string): void {
    this.current.delete(id);
  }
}
