import { createHash, type Hash } from 'node:crypto';
import { z } from 'zod';
import type { CodexProviderEvent } from '@smarteverything/domain';
interface MessageText {
  readonly hash: Hash;
  length: number;
}
export class CodexMessageText {
  private readonly items = new Map<string, MessageText>();
  private item(id: string): MessageText {
    let item = this.items.get(id);
    if (item === undefined) {
      item = { hash: createHash('sha256'), length: 0 };
      this.items.set(id, item);
    }
    return item;
  }
  observe(event: Extract<CodexProviderEvent, { kind: 'text' }>): void {
    if (event.item_id === null) return;
    const item = this.item(event.item_id);
    item.hash.update(event.delta);
    item.length += event.delta.length;
  }
  completed(event: Extract<CodexProviderEvent, { kind: 'work_item' }>): string {
    if (
      event.type !== 'agentMessage' ||
      event.payload['_phase'] !== 'completed' ||
      event.item_id === null
    )
      return '';
    const text = z.string().parse(event.payload['text']);
    const item = this.item(event.item_id);
    const prefix = createHash('sha256').update(text.slice(0, item.length)).digest('hex');
    if (prefix !== item.hash.copy().digest('hex'))
      throw new Error('The native completed message differs from its observed text.');
    const delta = text.slice(item.length);
    item.hash.update(delta);
    item.length = text.length;
    return delta;
  }
}
