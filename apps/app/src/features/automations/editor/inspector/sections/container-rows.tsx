import type { ReactNode } from 'react';
import type { FlowNode } from '@smarteverything/domain';
import { BranchRows } from './branch-rows';
import { CatchRows } from './catch-rows';
import { flowNodeOf } from './node-view';
import { OptionalLanes } from './optional-lane';
import { ParallelRows } from './parallel-rows';
import type { SectionProps } from './section-types';
import { SwitchRows } from './switch-rows';

interface RowsProps {
  readonly section: SectionProps;
  readonly node: FlowNode;
}

const ROW_EDITORS: Readonly<Record<string, (props: RowsProps) => ReactNode>> = {
  'flow.if': BranchRows,
  'flow.switch': SwitchRows,
  'flow.parallel': ParallelRows,
  'flow.try': CatchRows,
};

export function hasContainerRows(kindId: string): boolean {
  return Object.hasOwn(ROW_EDITORS, kindId);
}

export function ContainerRows(section: SectionProps): ReactNode {
  const node = flowNodeOf(section.view);
  const Editor = node === undefined ? undefined : ROW_EDITORS[node.kind];
  if (node === undefined || Editor === undefined) return null;
  return (
    <>
      <Editor section={section} node={node} />
      <OptionalLanes {...section} />
    </>
  );
}
