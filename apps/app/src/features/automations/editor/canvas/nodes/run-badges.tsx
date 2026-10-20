import type { ReactNode } from 'react';
import type { RunNode } from '../../../model/canvas/contract';
import { Glyph } from './icons';
import { Pill } from './chips';

export function runLabel(run: RunNode): string | null {
  if (run.state === 'skipped') return 'Skipped';
  if (run.text !== undefined && run.text !== '') return run.text;
  if (run.iteration !== undefined) return `Time ${String(run.iteration)}`;
  return null;
}

const GLYPH_BY_STATE: Readonly<Partial<Record<RunNode['state'], string>>> = {
  done: 'check',
  failed: 'x',
  waiting: 'clock',
};

const TONE_BY_STATE = {
  failed: 'critical',
  waiting: 'info',
} as const;

export function RunBadges({ run }: { readonly run: RunNode | null }): ReactNode {
  if (run === null) return null;
  const glyph = GLYPH_BY_STATE[run.state];
  const label = runLabel(run);
  const tone =
    run.state === 'failed' || run.state === 'waiting' ? TONE_BY_STATE[run.state] : undefined;
  return (
    <>
      {label === null ? null : (
        <span className="sn-run" data-state={run.state} title={label}>
          <Pill text={label} tone={tone} />
        </span>
      )}
      {glyph === undefined ? null : <Glyph name={glyph} className="sn-mark" />}
    </>
  );
}
