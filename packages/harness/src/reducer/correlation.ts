import { z } from 'zod';
import type { NativeBody } from './event';

export interface TurnIdentity {
  readonly delivery_id: string;
  readonly native_turn: number;
}

export class TurnCorrelation {
  private readonly ordinary = new Set<string>();
  private current: TurnIdentity | undefined;

  record(body: NativeBody): void {
    if (body.type === 'turn/start') this.current = undefined;
    if (body.type === 'user/message') this.ordinary.delete(body.data.id);
    if (body.type !== 'agent/inbox/spliced' || body.data.target !== 'next-turn') return;
    for (const message of body.data.inserted)
      if (z.uuid().safeParse(message.id).success) this.ordinary.add(message.id);
  }

  claimed(messageId: string, turn: number): boolean {
    if (!this.ordinary.delete(messageId)) return false;
    this.current = { delivery_id: messageId, native_turn: turn };
    return true;
  }

  discarded(messageId: string): boolean {
    return this.ordinary.delete(messageId);
  }

  identity(): TurnIdentity | undefined {
    return this.current;
  }

  ended(turn: number): TurnIdentity | undefined {
    return this.current?.native_turn === turn ? this.current : undefined;
  }

  finish(): void {
    this.current = undefined;
  }
}
