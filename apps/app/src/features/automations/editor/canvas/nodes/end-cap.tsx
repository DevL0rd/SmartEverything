import type { ReactNode } from 'react';
import type { SceneExecRow } from '../../../model/graph/scene-contract';
import { Glyph } from './icons';
import { ExecRow } from '../pins/exec-pin';

const END_PREFIX = 'End';
const RETURN_GLYPH = 'corner-down-left';

export function isReturnCap(label: string): boolean {
  return !label.startsWith(END_PREFIX);
}

export function EndCap({ label }: { readonly label: string }): ReactNode {
  return (
    <span className="gc-end-cap" data-kind={isReturnCap(label) ? 'return' : 'end'}>
      {isReturnCap(label) ? <Glyph name={RETURN_GLYPH} className="gc-end-glyph" /> : null}
      {label}
    </span>
  );
}

export function HeadCap({ row }: { readonly row: SceneExecRow }): ReactNode {
  if (row.endCap === null) return null;
  return (
    <div className="gc-head-cap">
      <EndCap label={row.endCap} />
    </div>
  );
}

export function CappedRow({
  row,
  caption,
}: {
  readonly row: SceneExecRow;
  readonly caption: string;
}): ReactNode {
  if (row.endCap === null) return <ExecRow row={row} caption={caption} />;
  return (
    <div className="gc-capped">
      <ExecRow row={row} caption={caption} />
      <EndCap label={row.endCap} />
    </div>
  );
}

export function CappedRows({
  rows,
  captionOf,
}: {
  readonly rows: readonly SceneExecRow[];
  readonly captionOf: (row: SceneExecRow) => string;
}): ReactNode {
  return rows.map((row) => <CappedRow key={row.handle} row={row} caption={captionOf(row)} />);
}
