import type { AutomationFunctionUser, FunctionV3 } from '@smarteverything/domain';
import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import { exitLine, interfaceCard } from '../detail/detail-model';
import { kindLabel } from '../library/library-model';
import { ExitRouteSheet } from './exit-route-sheet';
import { ImpactLabel } from './impact-label';
import { impactOf } from './impact-model';
import { InterfaceRows } from './interface-rows';
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

function Lists({
  program,
  panel,
  locked,
}: {
  readonly program: FunctionV3;
  readonly panel: InterfacePanelState;
  readonly locked: boolean;
}): ReactNode {
  const card = useMemo(() => interfaceCard(program), [program]);
  const rows = {
    editable: !locked,
    onAdd: panel.add,
    onEdit: panel.edit,
    onRemove: panel.remove,
    onReorder: panel.reorder,
  };
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
}: {
  readonly program: FunctionV3;
  readonly panel: InterfacePanelState;
}): ReactNode {
  return (
    <>
      <RowEditor
        side={panel.editing?.side ?? null}
        draft={panel.editing?.draft ?? blankDraft()}
        issues={panel.issues}
        taken={takenNames(program, panel.editing?.side ?? null)}
        onChange={panel.change}
        onSave={panel.save}
        onCancel={panel.cancel}
      />
      <ExitRouteSheet
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
      <Lists program={program} panel={panel} locked={locked} />
      <KeptSection program={program} locked={locked} onProgram={props.onProgram} />
      <Sheets program={program} panel={panel} />
    </View>
  );
}
