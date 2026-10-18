import type { ProviderContent } from '@smarteverything/domain';
import type { JobLog } from './job-log';
import { steerMessageOf, type ProviderInput } from './input';

export class ProviderSteers {
  private waiting: ProviderContent[] = [];

  constructor(
    private readonly input: ProviderInput,
    private readonly trace: JobLog,
  ) {}

  add(content: readonly ProviderContent[]): void {
    this.waiting.push(...content);
    this.trace.steered(content.length);
  }

  deliver(): void {
    this.send(false);
  }

  followUp(turnSucceeded: boolean): boolean {
    if (!turnSucceeded) {
      this.clear();
      return false;
    }
    return this.send(true);
  }

  clear(): void {
    this.waiting = [];
  }

  private send(followUp: boolean): boolean {
    if (this.waiting.length === 0) return false;
    const content = this.waiting;
    this.waiting = [];
    this.input.push(steerMessageOf(content));
    this.trace.steerDelivered(content.length, followUp);
    return true;
  }
}
