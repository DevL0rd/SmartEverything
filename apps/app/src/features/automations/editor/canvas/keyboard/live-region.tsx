import type { ReactNode } from 'react';
import type { Shown } from '../connect/connect-toast';

export function problemsMessage(before: number, after: number): string | null {
  if (before === after) return null;
  if (after === 0) return 'No problems left.';
  return `${String(after)} ${after === 1 ? 'problem' : 'problems'}.`;
}

export function LiveRegion({
  polite,
  assertive,
}: {
  readonly polite: Shown | null;
  readonly assertive: Shown | null;
}): ReactNode {
  return (
    <>
      <div className="gc-live" role="status" aria-live="polite" aria-atomic>
        {polite === null ? null : <span key={polite.seq}>{polite.text}</span>}
      </div>
      <div className="gc-live" role="alert" aria-live="assertive" aria-atomic>
        {assertive === null ? null : <span key={assertive.seq}>{assertive.text}</span>}
      </div>
    </>
  );
}
