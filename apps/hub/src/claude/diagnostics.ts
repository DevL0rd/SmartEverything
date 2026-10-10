import type { Logger } from '@smarteverything/logging';
import type { ClaudeStatus } from '@smarteverything/domain';

export type ClaudeSource = ClaudeStatus['diagnostics'][number]['source'];

const LISTED = 50;

export class Diagnostics {
  private readonly problems = new Map<string, ClaudeStatus['diagnostics'][number]>();

  constructor(private readonly log: Logger) {}

  report(source: ClaudeSource, name: string, problem: string): void {
    const key = `${source}:${name}`;
    if (this.problems.get(key)?.problem === problem) {
      return;
    }
    this.problems.set(key, { source, name, problem: problem.slice(0, 400) });
    this.log.warn('file.rejected', { source, name, problem });
  }

  clear(source: ClaudeSource, name: string): void {
    this.problems.delete(`${source}:${name}`);
  }

  list(): ClaudeStatus['diagnostics'] {
    return [...this.problems.values()].slice(0, LISTED);
  }
}
