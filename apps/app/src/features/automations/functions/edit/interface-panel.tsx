import type { AutomationFunctionUser, FunctionV3 } from '@smarteverything/domain';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import { exitLine, interfaceCard } from '../detail/detail-model';
import { kindLabel } from '../library/library-model';
import { ExitRouteSheet } from './exit-route-sheet';
import { ImpactLabel } from './impact-label';
import { impactOf } from './impact-model';
import { InterfaceRows, type InterfaceOpener, type InterfaceRowsProps } from './interface-rows';
import { KeptSection } from './kept-section';
import { RowEditor } from './row-editor';
import { useInterfacePanel, type EditSide, type InterfacePanelState } from './use-interface-panel';
import { blankDraft } from './row-draft-model';

export interface InterfacePanelProps {
  readonly saved: FunctionV3;
  readonly program: FunctionV3;
  readonly name: string;
  readonly version: number;
  readonly ownership: string;
  readonly users: readonly AutomationFunctionUser[];
  readonly locked: boolean;
  readonly onName: (name: string) => void;
  readonly onProgram: (program: FunctionV3) => void;
}

function takenNames(program: FunctionV3, side: EditSide | null): readonly string[] {
  if (side === 'exits') return program.exits;
  return (side === 'outputs' ? program.outputs : program.inputs).map((port) => port.name);
}

function rowActions(
  panel: InterfacePanelState,
  locked: boolean,
  setOpener: (opener: InterfaceOpener) => void,
): Pick<InterfaceRowsProps, 'editable' | 'onAdd' | 'onEdit' | 'onRemove' | 'onReorder'> {
  return {
    editable: !locked,
    onAdd: (side: EditSide, opener: InterfaceOpener): void => {
      setOpener(opener);
      panel.add(side);
    },
    onEdit: (side: 'inputs' | 'outputs', name: string, opener: InterfaceOpener): void => {
      setOpener(opener);
      panel.edit(side, name);
    },
    onRemove: (side: EditSide, name: string, opener: InterfaceOpener): void => {
      setOpener(opener);
      panel.remove(side, name);
    },
    onReorder: panel.reorder,
  };
}

function Lists({
  program,
  panel,
  locked,
  setOpener,
}: {
  readonly program: FunctionV3;
  readonly panel: InterfacePanelState;
  readonly locked: boolean;
  readonly setOpener: (opener: InterfaceOpener) => void;
}): ReactNode {
  const card = useMemo(() => interfaceCard(program), [program]);
  const rows = rowActions(panel, locked, setOpener);
  return (
    <>
      <InterfaceRows
        side="inputs"
        title="Inputs"
        addLabel="Add an input"
        lines={card.inputs}
        {...rows}
      />
      <InterfaceRows
        side="outputs"
        title="Outputs"
        addLabel="Add an output"
        lines={card.outputs}
        {...rows}
      />
      <InterfaceRows
        side="exits"
        title="Exits"
        addLabel="Add an exit"
        lines={program.exits.map(exitLine)}
        {...rows}
      />
    </>
  );
}

function Sheets({
  program,
  panel,
  opener,
}: {
  readonly program: FunctionV3;
  readonly panel: InterfacePanelState;
  readonly opener: InterfaceOpener | null;
}): ReactNode {
  return (
    <>
      <RowEditor
        opener={opener}
        side={panel.editing?.side ?? null}
        draft={panel.editing?.draft ?? blankDraft()}
        issues={panel.issues}
        taken={takenNames(program, panel.editing?.side ?? null)}
        onChange={panel.change}
        onSave={panel.save}
        onCancel={panel.cancel}
      />
      <ExitRouteSheet
        opener={opener}
        routing={panel.routing}
        choices={program.exits}
        onPick={panel.route}
        onCancel={panel.cancelRoute}
      />
    </>
  );
}

export function InterfacePanel(props: InterfacePanelProps): ReactNode {
  const { program, saved, locked } = props;
  const [opener, setOpener] = useState<InterfaceOpener | null>(null);
  const panel = useInterfacePanel(program, props.onProgram);
  const impact = useMemo(
    () => impactOf(saved, program, props.users),
    [saved, program, props.users],
  );
  return (
    <View className="gap-4">
      <View className="gap-1">
        <TextField label="Name" value={props.name} disabled={locked} onChange={props.onName} />
        <Text variant="footnote" tone="variant">
          {`${kindLabel(program.flavour)} · version ${String(props.version)} · ${props.ownership}`}
        </Text>
      </View>
      <ImpactLabel impact={impact} />
      {panel.notice === null ? null : (
        <Text variant="callout" tone="critical" accessibilityLiveRegion="polite">
          {panel.notice}
        </Text>
      )}
      <Lists program={program} panel={panel} locked={locked} setOpener={setOpener} />
      <KeptSection program={program} locked={locked} onProgram={props.onProgram} />
      <Sheets program={program} panel={panel} opener={opener} />
    </View>
  );
}
