import { useMemo, type ReactNode } from 'react';
import type { Layout } from '@smarteverything/domain';
import type { Program } from '@smarteverything/flow/program/walk';
import { DockedPane } from '../../../../components/docked-pane';
import { usePausable } from '../../../../design/external-store';
import type { DocumentStore } from '../../model/editor/document-store';
import { Inspector } from '../inspector/inspector';
import type {
  InspectorActions,
  InspectorEnv,
  InspectorFinding,
} from '../inspector/sections/section-types';
import type { InsertState } from '../palette/armed-insert';
import { Palette } from '../palette/palette';
import type { PaletteChoice } from '../palette/palette-categories';
import { STEP_CONTEXT } from '../palette/palette-search';
import { ProblemsDrawer } from '../problems/problems-drawer';
import { ProblemsSheet } from '../problems/problems-sheet';
import type { ProblemHandlers } from '../problems/problem-rows';
import { inspectorFindings, type LiveCheck } from '../problems/problem-model';
import { PANE_LIMITS, type PaneSizes } from './screen-model';

export interface InspectorEnvInput {
  readonly program: Program;
  readonly layout: Layout;
  readonly target: string | null;
  readonly findings: readonly InspectorFinding[];
}

export interface InspectorBinding {
  readonly actions: Omit<InspectorActions, 'fix'>;
  readonly buildEnv: (input: InspectorEnvInput) => InspectorEnv;
}

export interface PaneProps {
  readonly sizes: PaneSizes;
  readonly onResize: (pane: keyof PaneSizes, width: number) => void;
}

function Docked({
  side,
  label,
  slot,
  open,
  onOpenChange,
  sizing,
  children,
}: {
  readonly side: 'left' | 'right';
  readonly label: string;
  readonly slot: keyof PaneSizes;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly sizing: PaneProps;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <DockedPane
      side={side}
      label={label}
      open={open}
      width={sizing.sizes[slot]}
      minWidth={PANE_LIMITS.min}
      maxWidth={PANE_LIMITS.max}
      onResize={(width) => {
        sizing.onResize(slot, width);
      }}
      onOpenChange={onOpenChange}
    >
      {children}
    </DockedPane>
  );
}

export interface PaletteHostProps {
  readonly state: InsertState;
  readonly onChoose: (choice: PaletteChoice) => void;
  readonly onClose: () => void;
}

export function PaletteHost(props: PaletteHostProps): ReactNode {
  return (
    <Palette
      state={props.state}
      context={STEP_CONTEXT}
      onChoose={props.onChoose}
      onClose={props.onClose}
    />
  );
}

export function PaletteDock({
  host,
  open,
  onOpen,
  pane,
}: {
  readonly host: PaletteHostProps;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly pane: PaneProps;
}): ReactNode {
  return (
    <Docked
      side="left"
      label="Add a step"
      slot="palette"
      open={open}
      onOpenChange={(next) => {
        if (next) onOpen();
        else host.onClose();
      }}
      sizing={pane}
    >
      <PaletteHost {...host} />
    </Docked>
  );
}

export interface InspectorHostProps {
  readonly store: DocumentStore;
  readonly check: LiveCheck;
  readonly target: string | null;
  readonly binding: InspectorBinding;
  readonly docked: boolean;
  readonly onFix: (findingId: string) => void;
  readonly onClose: () => void;
}

export function InspectorHost({
  store,
  check,
  target,
  binding,
  docked,
  onFix,
  onClose,
}: InspectorHostProps): ReactNode {
  const program = usePausable(store.state.subscribe, () => store.state.get().program);
  const layout = usePausable(store.state.subscribe, () => store.state.get().layout);
  const findings = useMemo(
    () => (target === null ? [] : inspectorFindings(check.findings, target)),
    [check.findings, target],
  );
  const env = useMemo(
    () => binding.buildEnv({ program, layout, target, findings }),
    [binding, program, layout, target, findings],
  );
  const actions = useMemo(() => ({ ...binding.actions, fix: onFix }), [binding.actions, onFix]);
  return (
    <Inspector selectedId={target} env={env} actions={actions} docked={docked} onClose={onClose} />
  );
}

export function InspectorDock({
  host,
  pane,
}: {
  readonly host: InspectorHostProps;
  readonly pane: PaneProps;
}): ReactNode {
  if (host.target === null) return null;
  return (
    <Docked
      side="right"
      label="Step options"
      slot="inspector"
      open
      onOpenChange={host.onClose}
      sizing={pane}
    >
      <InspectorHost {...host} docked />
    </Docked>
  );
}

export interface ProblemsHostProps extends ProblemHandlers {
  readonly check: LiveCheck;
  readonly open: boolean;
  readonly onClose: () => void;
}

export function ProblemsDock({
  host,
  pane,
}: {
  readonly host: ProblemsHostProps;
  readonly pane: PaneProps;
}): ReactNode {
  if (!host.open) return null;
  return (
    <Docked
      side="right"
      label="Problems"
      slot="problems"
      open
      onOpenChange={host.onClose}
      sizing={pane}
    >
      <ProblemsDrawer
        check={host.check}
        onClose={host.onClose}
        onGoTo={host.onGoTo}
        onFix={host.onFix}
      />
    </Docked>
  );
}

export function ProblemsPhone({ host }: { readonly host: ProblemsHostProps }): ReactNode {
  return (
    <ProblemsSheet
      open={host.open}
      check={host.check}
      onClose={host.onClose}
      onGoTo={host.onGoTo}
      onFix={host.onFix}
    />
  );
}
