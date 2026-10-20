import { NODE_REGISTRY, outlineLines, type RefNames } from '@smarteverything/domain';
import type { Template } from './parameters';

const INDENT = '  ';
const SHOWN = 5;
const SAYS_WHEN = /^when\b/i;

export function previewLines(
  entry: Template,
  names: RefNames,
  limit: number = SHOWN,
): readonly string[] {
  const lines = outlineLines(entry.build(), { kinds: (id) => NODE_REGISTRY.get(id), names });
  return lines
    .filter((line) => line.kind !== 'scope')
    .slice(0, limit)
    .map((line) => {
      const text =
        line.kind === 'trigger' && !SAYS_WHEN.test(line.summary)
          ? `When ${line.summary}`
          : line.summary;
      return `${INDENT.repeat(line.depth)}${text}`;
    });
}

export interface Clock {
  readonly hour: number;
  readonly minute: number;
}

const CLOCK = /^(\d{2}):(\d{2})$/;

export function clockOf(text: string): Clock | null {
  const parts = CLOCK.exec(text);
  if (parts === null) return null;
  const [, hour = '', minute = ''] = parts;
  return { hour: Number(hour), minute: Number(minute) };
}

export function clockText(clock: Clock): string {
  return `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;
}
