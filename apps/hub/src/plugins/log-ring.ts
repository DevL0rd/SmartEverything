import type { PluginLogLine } from '@smarteverything/domain';

const KEEP = 500;
const LONGEST_LINE = 4_000;

export class LogRing {
  private readonly lines: PluginLogLine[] = [];

  add(line: string, at: Date): void {
    const text = line.trimEnd();
    if (text === '') {
      return;
    }
    this.lines.push({ at: at.toISOString(), line: text.slice(0, LONGEST_LINE) });
    if (this.lines.length > KEEP) {
      this.lines.splice(0, this.lines.length - KEEP);
    }
  }

  read(): readonly PluginLogLine[] {
    return [...this.lines];
  }
}
