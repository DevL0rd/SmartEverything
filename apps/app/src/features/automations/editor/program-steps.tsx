import type { ReactNode } from 'react';
import { useContext, useState } from 'react';
import { View } from 'react-native';
import type { Action } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ListRow } from '../../../components/list-row';
import { Select } from '../../../components/select';
import { Sheet } from '../../../components/sheet';
import type { Catalog } from '../data/use-automations';
import { describeAction } from '../model/describe';
import {
  PROGRAM_LOOKS,
  programChoices,
  sequenceAction,
  valueUpdateAction,
} from '../model/program-actions';
import { ProgramStepActions, ProgramTreeContext } from './program-step-actions';
import { Text } from '../../../components/text';
import { actionForFocus } from '../model/program-blocks';
import { useEditorFocus } from './editor-focus';
import { useProgramLibrary } from './program-library-context';
import { ProgramActionFields } from './program-action-fields';

interface ProgramStepsProps {
  readonly actions: readonly Action[];
  readonly catalog: Catalog;
  readonly onChange: (actions: readonly Action[]) => void;
}
interface ProgramStepProps extends ProgramStepsProps {
  readonly action: Action;
  readonly index: number;
  readonly onOpen: () => void;
}

function ProgramStep({
  actions,
  catalog,
  onChange,
  action,
  index,
  onOpen,
}: ProgramStepProps): ReactNode {
  return (
    <Card>
      <ListRow
        icon={PROGRAM_LOOKS[action.type].icon}
        title={`${String(index + 1)}. ${PROGRAM_LOOKS[action.type].label}`}
        subtitle={describeAction(catalog.names, action)}
        wrapSubtitle
        chevron
        onPress={onOpen}
      />
      <ProgramStepActions actions={actions} onChange={onChange} action={action} index={index} />
    </Card>
  );
}
interface AddProgramStepProps {
  readonly choices: ReturnType<typeof programChoices>;
  readonly onAdd: (action: Action) => void;
}
function AddProgramStep({ choices, onAdd }: AddProgramStepProps): ReactNode {
  const library = useProgramLibrary();
  return (
    <Select
      label="Add a step"
      value={null}
      searchable
      options={[
        ...choices.map((choice) => ({ value: choice.key, label: choice.label })),
        ...(library === null
          ? []
          : [
              { value: 'create-value', label: 'Change a Value · create Value' },
              { value: 'create-sequence', label: 'Call a sequence · create sequence' },
            ]),
      ]}
      onChange={(key) => {
        if (key === 'create-value' && library !== null) {
          library.value(null, 'boolean', (row) => {
            onAdd(valueUpdateAction(row));
          });
          return;
        }
        if (key === 'create-sequence' && library !== null) {
          library.sequence(null, (row) => {
            onAdd(sequenceAction(row));
          });
          return;
        }
        const choice = choices.find((entry) => entry.key === key);
        if (choice !== undefined) onAdd(choice.action);
      }}
    />
  );
}

interface ProgramInspectorProps extends ProgramStepsProps {
  readonly current: Action | undefined;
  readonly onClose: () => void;
}
function ProgramInspector({
  current,
  catalog,
  actions,
  onChange,
  onClose,
}: ProgramInspectorProps): ReactNode {
  return (
    <Sheet
      open={current !== undefined}
      title={current === undefined ? 'Step' : PROGRAM_LOOKS[current.type].label}
      detents={['full']}
      kind="inspector"
      footer={
        <Button
          label="Done"
          onPress={() => {
            onClose();
          }}
        />
      }
      onClose={() => {
        onClose();
      }}
    >
      {current === undefined ? null : (
        <ProgramActionFields
          action={current}
          catalog={catalog}
          onChange={(next) => {
            onChange(actions.map((entry) => (entry.nodeId === current.nodeId ? next : entry)));
          }}
        />
      )}
    </Sheet>
  );
}

interface ProgramBlockProps extends ProgramStepsProps {
  readonly root: boolean;
}
function ProgramBlock(props: ProgramBlockProps): ReactNode {
  const { actions, catalog, onChange } = props;
  const [selected, setSelected] = useState<string | null>(null);

  const choices = programChoices(catalog);
  const focus = useEditorFocus();
  const focused = actionForFocus(actions, focus.target);
  return (
    <View className="gap-3">
      {props.root && focus.target?.startsWith('node:') === true && focused === undefined ? (
        <Text variant="callout" tone="critical">
          This step is no longer in your draft. Your edits are kept.
        </Text>
      ) : null}
      {actions.map((action, index) => (
        <ProgramStep
          key={action.nodeId ?? String(index)}
          {...props}
          action={action}
          index={index}
          onOpen={() => {
            if (focused !== undefined && action.nodeId !== undefined)
              focus.open(`node:${action.nodeId}`);
            else setSelected(action.nodeId ?? null);
          }}
        />
      ))}
      <AddProgramStep
        choices={choices}
        onAdd={(action) => {
          onChange([...actions, action]);
          setSelected(action.nodeId ?? null);
        }}
      />
      <ProgramInspector
        {...props}
        current={focused ?? actions.find((action) => action.nodeId === selected)}
        onClose={() => {
          if (focused !== undefined) focus.close();
          setSelected(null);
        }}
      />
    </View>
  );
}

export function ProgramSteps(props: ProgramStepsProps): ReactNode {
  const tree = useContext(ProgramTreeContext);
  return tree === null ? (
    <ProgramTreeContext value={props}>
      <ProgramBlock {...props} root />
    </ProgramTreeContext>
  ) : (
    <ProgramBlock {...props} root={false} />
  );
}
