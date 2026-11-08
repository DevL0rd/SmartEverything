import type { ReactNode } from 'react';
import { CommittedField } from './committed-field';
import type { GraphSectionProps } from './graph-connections-model';
import { branchTitle, caseTitle, rowNameOps } from './graph-row-model';

const TITLES = { branch: branchTitle, case: caseTitle } as const;

export function RowName({
  section,
  kind,
  row,
  index,
}: {
  readonly section: GraphSectionProps;
  readonly kind: 'branch' | 'case';
  readonly row: { readonly id: string; readonly name?: string | undefined };
  readonly index: number;
}): ReactNode {
  const { node, locked, actions } = section;
  return (
    <CommittedField
      label="Name"
      placeholder={TITLES[kind](index)}
      value={row.name ?? ''}
      disabled={locked}
      onCommit={(text) => {
        actions.apply(rowNameOps(node.key, kind, row.id, text));
      }}
    />
  );
}
