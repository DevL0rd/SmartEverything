import { nonEmptyLines, type Run } from './process.ts';

const LINES_PER_CHECK = 6;
const LINE_CHARS = 220;
const OUTPUT_CHARS = 2400;

export interface Section {
  readonly check: string;
  readonly lines: readonly string[];
}

function clip(line: string): string {
  return line.length > LINE_CHARS ? `${line.slice(0, LINE_CHARS)}...` : line;
}

function render(section: Section): string {
  const shown = section.lines.slice(0, LINES_PER_CHECK).map((line) => `  ${clip(line)}`);
  const hidden = section.lines.length - LINES_PER_CHECK;
  const more = hidden > 0 ? [`  (+${String(hidden)} more)`] : [];
  return [`${section.check}:`, ...shown, ...more].join('\n');
}

export function report(title: string, sections: readonly (Section | null)[]): number {
  const failing = sections.filter((section): section is Section => section !== null);
  if (failing.length === 0) return 0;
  const body = [title, ...failing.map(render)].join('\n');
  process.stderr.write(`${body.slice(0, OUTPUT_CHARS)}\n`);
  return 2;
}

const notices: string[] = [];

export function warnUser(message: string): number {
  notices.push(message);
  return 0;
}

export function flushNotices(): void {
  if (notices.length === 0) return;
  const systemMessage = `claude-hook: ${notices.join('; ')}`;
  process.stdout.write(`${JSON.stringify({ systemMessage })}\n`);
  notices.length = 0;
}

export function timedOut(check: string, timeoutMs: number): Section {
  return {
    check,
    lines: [`timed out after ${String(timeoutMs / 1000)} s, so nothing was checked`],
  };
}

export function rawFailure(check: string, result: Run): Section {
  const lines = nonEmptyLines(`${result.stdout}\n${result.stderr}`);
  return { check, lines: lines.length > 0 ? lines : [`failed without output: ${result.detail}`] };
}
