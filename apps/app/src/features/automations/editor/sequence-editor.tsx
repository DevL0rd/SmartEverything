import type { ReactNode } from 'react';
import { useContext, useState } from 'react';
import { View } from 'react-native';
import type { AutomationRunRow, AutomationSequenceRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Section } from '../../../components/section';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useCatalog, type Catalog } from '../data/use-automations';
import { useReloadSaved } from './editor-navigation';
import { LibraryReturnContext } from './library-return';
import { EditorFocusProvider, FocusedFields, focusedField, useEditorFocus } from './editor-focus';
import { sequenceEditorField } from '../model/focus-targets';
import { ProgramSteps } from './program-steps';
import { FocusedRun } from './focused-run';
import { RunPolicyFields } from './run-policy-fields';
import { SequenceParameters } from './sequence-parameters';
import { useSequenceEditor, type SequenceEditorState } from './use-sequence-editor';
import { OwnedRuns, OwnedRunSheet } from '../components/owned-runs';
import { SequenceTest } from '../components/sequence-test';

interface SequenceEditorProps {
  readonly start: AutomationSequenceRow | null;
}
interface SequenceFieldsProps {
  readonly editor: SequenceEditorState;
  readonly catalog: Catalog;
}
function SequenceHistory({ editor }: { readonly editor: SequenceEditorState }): ReactNode {
  return (
    <View className="flex-row gap-2">
      <Button
        label="Undo"
        icon="undo"
        variant="tonal"
        disabled={editor.undo === null}
        onPress={() => editor.undo?.()}
      />
      <Button
        label="Redo"
        variant="tonal"
        disabled={editor.redo === null}
        onPress={() => editor.redo?.()}
      />
    </View>
  );
}
function SequenceFields({ editor, catalog }: SequenceFieldsProps): ReactNode {
  const { definition, setDefinition } = editor;
  return (
    <>
      <TextField label="Name" value={editor.name} onChange={editor.setName} />
      <Section
        title="Parameters"
        footer="Each call supplies these named inputs. Changing a name or type also requires updating its callers."
      >
        <SequenceParameters
          parameters={definition.parameters}
          onChange={(parameters) => {
            setDefinition({ ...definition, parameters });
          }}
        />
      </Section>
      <SequenceHistory editor={editor} />
      <Section title="Steps">
        <ProgramSteps
          actions={definition.actions}
          catalog={sequenceCatalog(editor, catalog)}
          onChange={(actions) => {
            setDefinition({ ...definition, actions: [...actions] });
          }}
        />
      </Section>
      <Section title="Run behavior">
        <RunPolicyFields
          policy={definition.runPolicy}
          controlKey={definition.controlKey}
          onChange={(runPolicy, controlKey) => {
            setDefinition({ ...definition, runPolicy, controlKey });
          }}
        />
      </Section>
      <Text variant="footnote" tone="variant">
        Save before testing. Each test starts a real owned run.
      </Text>
    </>
  );
}
interface SequenceActionsProps {
  readonly editor: SequenceEditorState;
  readonly onTest: () => void;
}
function SequenceActions({ editor, onTest }: SequenceActionsProps): ReactNode {
  return (
    <View className="flex-row justify-end gap-3">
      <Button
        label="Test run"
        icon="play"
        variant="tonal"
        disabled={editor.saved === null || editor.dirty || editor.busy}
        onPress={onTest}
      />
      <Button label="Save" icon="check" loading={editor.busy} onPress={editor.save} />
    </View>
  );
}
interface SequenceHeaderProps {
  readonly editor: SequenceEditorState;
}
function SequenceHeader({ editor }: SequenceHeaderProps): ReactNode {
  const reload = useReloadSaved();
  return (
    <PageHeader
      title={editor.saved === null ? 'New sequence' : editor.saved.name}
      overflow={
        editor.saved === null
          ? []
          : [
              { label: 'Reload saved', icon: 'refresh', onPress: reload },
              { label: 'Delete', icon: 'trash', destructive: true, onPress: editor.remove },
            ]
      }
    />
  );
}

function sequenceCatalog(editor: SequenceEditorState, catalog: Catalog): Catalog {
  return {
    ...catalog,
    parameters: editor.definition.parameters,
    sequences: (catalog.sequences ?? []).filter((row) => row.id !== editor.saved?.id),
  };
}
function focusedParameter(target: string | null): string | null {
  return target?.startsWith('parameter:') === true ? target.slice('parameter:'.length) : null;
}
function FocusedParameters({
  editor,
  parameter,
}: {
  readonly editor: SequenceEditorState;
  readonly parameter: string | null;
}): ReactNode {
  const definition = editor.definition;
  return (
    <SequenceParameters
      parameters={definition.parameters}
      focusName={parameter ?? definition.parameters[0]?.name ?? null}
      onChange={(parameters) => {
        editor.setDefinition({ ...definition, parameters });
      }}
    />
  );
}
function SequenceFocusedFields({ editor, catalog }: SequenceFieldsProps): ReactNode {
  const { target } = useEditorFocus();
  const parameter = focusedParameter(target);
  const field = parameter === null ? focusedField(target) : 'parameters';
  const definition = editor.definition;
  if (!sequenceEditorField(field)) return null;
  switch (field) {
    case 'name':
      return <TextField label="Name" value={editor.name} onChange={editor.setName} focusOnMount />;
    case 'parameters':
      return <FocusedParameters editor={editor} parameter={parameter} />;
    case 'steps':
      return (
        <ProgramSteps
          actions={definition.actions}
          catalog={sequenceCatalog(editor, catalog)}
          onChange={(actions) => {
            editor.setDefinition({ ...definition, actions: [...actions] });
          }}
        />
      );
    case 'policy':
    case 'controlKey':
      return (
        <RunPolicyFields
          policy={definition.runPolicy}
          controlKey={definition.controlKey}
          focusControlKey={field === 'controlKey'}
          onChange={(runPolicy, controlKey) => {
            editor.setDefinition({ ...definition, runPolicy, controlKey });
          }}
        />
      );
  }
}
function SequenceFocus(props: SequenceFieldsProps): ReactNode {
  const { target } = useEditorFocus();
  const field = focusedParameter(target) === null ? focusedField(target) : 'parameters';
  return (
    <FocusedFields field={field}>
      <SequenceFocusedFields {...props} />
    </FocusedFields>
  );
}
interface SequencePanelsProps extends SequenceFieldsProps {
  readonly testing: boolean;
  readonly setTesting: (testing: boolean) => void;
  readonly run: AutomationRunRow | null;
  readonly setRun: (run: AutomationRunRow | null) => void;
}
function SequencePanels({
  editor,
  catalog,
  testing,
  setTesting,
  run,
  setRun,
}: SequencePanelsProps): ReactNode {
  return (
    <>
      <SequenceFields editor={editor} catalog={catalog} />
      <SequenceFocus editor={editor} catalog={catalog} />
      <FocusedRun />
      {editor.saved === null ? null : (
        <>
          <OwnedRuns automationId={editor.saved.id} targetType="sequence" />
          <SequenceTest
            row={editor.saved}
            catalog={catalog}
            open={testing}
            onClose={() => {
              setTesting(false);
            }}
            onRun={(next) => {
              setTesting(false);
              setRun(next);
            }}
          />
        </>
      )}
      <OwnedRunSheet
        run={run}
        onClose={() => {
          setRun(null);
        }}
      />
    </>
  );
}
export function SequenceEditor({ start }: SequenceEditorProps): ReactNode {
  const editor = useSequenceEditor(start);
  const [testing, setTesting] = useState(false);
  const [run, setRun] = useState<AutomationRunRow | null>(null);
  const catalog = useCatalog();
  const destination = useContext(LibraryReturnContext);
  const panels = (
    <SequencePanels
      editor={editor}
      catalog={catalog}
      testing={testing}
      setTesting={setTesting}
      run={run}
      setRun={setRun}
    />
  );
  const actions = (
    <SequenceActions
      editor={editor}
      onTest={() => {
        setTesting(true);
      }}
    />
  );
  return (
    <EditorFocusProvider>
      {destination === null ? (
        <Screen maxWidth="reading" header={<SequenceHeader editor={editor} />} footer={actions}>
          {panels}
        </Screen>
      ) : (
        <View className="gap-section-gap">
          {panels}
          {actions}
        </View>
      )}
    </EditorFocusProvider>
  );
}
