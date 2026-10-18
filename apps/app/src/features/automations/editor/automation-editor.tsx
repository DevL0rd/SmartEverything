import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Disclosure } from '../../../components/disclosure';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Section } from '../../../components/section';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import { OwnedRunSheet } from '../components/owned-runs';
import { TestInputsSheet } from '../components/test-inputs-sheet';
import type { Catalog } from '../data/use-automations';
import type { Draft } from '../model/editor-state';
import { automationEditorField, reusableEditorField } from '../model/focus-targets';
import { OnlyIfBlock, ThenBlock, WhenBlock, type BlockProps } from './blocks';
import { EditorFocusProvider, FocusedFields, focusedField, useEditorFocus } from './editor-focus';
import { FooterBar, NameBlock, Preview, TestNote, previewOf, useOverflow } from './editor-parts';
import { FocusedRun } from './focused-run';
import { InputsFields } from './inputs-section';
import { RunBehaviourFields } from './run-behaviour-fields';
import { StepInspector } from './step-inspector';
import { StepTreeProvider } from './step-tree';
import { useEditor, type Editor } from './use-editor';

interface PartProps extends BlockProps {
  readonly reusable: boolean;
}

function AdvancedBlock({ draft, change }: BlockProps): ReactNode {
  const { mode, max, key } = draft.automation;
  const [open, setOpen] = useState(false);
  return (
    <Disclosure
      label="Advanced"
      hint="Shows what happens when it starts again while running"
      open={open}
      onToggle={() => {
        setOpen(!open);
      }}
    >
      <RunBehaviourFields
        run={{ mode, max, key }}
        onChange={(run) => {
          change({ type: 'run', run });
        }}
      />
    </Disclosure>
  );
}

function InputsBlock({ draft, change }: BlockProps): ReactNode {
  return (
    <Section
      title="Inputs"
      footer="Whoever runs these steps gives each input a value. Use them inside the steps."
    >
      <InputsFields
        inputs={draft.automation.inputs ?? []}
        onChange={(inputs) => {
          change({ type: 'inputs', inputs });
        }}
      />
    </Section>
  );
}

function ProgramBlocks({ reusable, ...blocks }: PartProps): ReactNode {
  return reusable ? (
    <>
      <InputsBlock {...blocks} />
      <ThenBlock {...blocks} />
    </>
  ) : (
    <>
      <WhenBlock {...blocks} />
      <OnlyIfBlock {...blocks} />
      <ThenBlock {...blocks} />
    </>
  );
}

function focusField(target: string | null): ReturnType<typeof focusedField> {
  if (target?.startsWith('condition:') === true) return 'conditions';
  if (target?.startsWith('input:') === true) return 'inputs';
  return focusedField(target);
}

function FocusedInputs({ editor }: { readonly editor: Editor }): ReactNode {
  const { target } = useEditorFocus();
  return (
    <InputsFields
      inputs={editor.draft.automation.inputs ?? []}
      focusName={target?.startsWith('input:') === true ? target.slice('input:'.length) : null}
      onChange={(inputs) => {
        editor.change({ type: 'inputs', inputs });
      }}
    />
  );
}

function FocusedBlock({
  editor,
  field,
}: {
  readonly editor: Editor;
  readonly field: string;
}): ReactNode {
  const blocks = {
    draft: editor.draft,
    change: editor.change,
    catalog: editor.catalog,
    problems: editor.problems,
  };
  switch (field) {
    case 'when':
      return <WhenBlock {...blocks} />;
    case 'conditions':
      return <OnlyIfBlock {...blocks} />;
    case 'steps':
      return <ThenBlock {...blocks} />;
    case 'advanced':
      return <AdvancedBlock {...blocks} />;
    default:
      return null;
  }
}

function FocusedContent({
  editor,
  reusable,
}: {
  readonly editor: Editor;
  readonly reusable: boolean;
}): ReactNode {
  const field = focusField(useEditorFocus().target);
  const allowed = reusable ? reusableEditorField(field) : automationEditorField(field);
  if (!allowed || field === null) return null;
  if (field === 'name') return <NameBlock editor={editor} reusable={reusable} focused />;
  return field === 'inputs' ? (
    <FocusedInputs editor={editor} />
  ) : (
    <FocusedBlock editor={editor} field={field} />
  );
}

function TestInputs({ editor }: { readonly editor: Editor }): ReactNode {
  if (!editor.validation.valid) return null;
  return (
    <TestInputsSheet
      automationId={editor.automationId}
      definition={editor.validation.automation}
      name={editor.draft.name}
      inputs={editor.validation.automation.inputs ?? []}
      catalog={editor.catalog}
      open={editor.asking}
      onClose={() => {
        editor.setAsking(false);
      }}
      onRun={(run) => {
        editor.setAsking(false);
        editor.setRun(run);
      }}
    />
  );
}

function EditorBody({
  editor,
  reusable,
  showPreview,
  sentence,
}: {
  readonly editor: Editor;
  readonly reusable: boolean;
  readonly showPreview: boolean;
  readonly sentence: string | null;
}): ReactNode {
  const blocks = {
    draft: editor.draft,
    change: editor.change,
    catalog: editor.catalog,
    problems: editor.problems,
    reusable,
  };
  const focus = useEditorFocus();
  return (
    <>
      {showPreview ? (
        <Card>
          <Preview sentence={sentence} />
        </Card>
      ) : null}
      <NameBlock editor={editor} reusable={reusable} />
      <ProgramBlocks {...blocks} />
      <AdvancedBlock {...blocks} />
      <TestNote />
      <FocusedFields field={focusField(focus.target)}>
        <FocusedContent editor={editor} reusable={reusable} />
      </FocusedFields>
      <FocusedRun />
      <OwnedRunSheet
        run={editor.run}
        onClose={() => {
          editor.setRun(null);
        }}
      />
      <TestInputs editor={editor} />
    </>
  );
}

interface ShellProps {
  readonly editor: Editor;
  readonly reusable: boolean;
  readonly takenNames: readonly string[];
}

function EditorHeader({
  editor,
  reusable,
  takenNames,
  touch,
  onTest,
}: ShellProps & { readonly touch: boolean; readonly onTest: () => void }): ReactNode {
  const overflow = useOverflow(editor, takenNames);
  const actions: HeaderAction[] = [
    ...(editor.undo === null
      ? []
      : [{ icon: 'undo', label: 'Undo', onPress: editor.undo, iconOnly: true } as const]),
    ...(touch
      ? []
      : [
          ...(editor.canTest
            ? [{ icon: 'play', label: 'Test run', onPress: onTest } as const]
            : []),
          { icon: 'check', label: 'Save', onPress: editor.save, primary: true } as const,
        ]),
  ];
  const fallback = reusable ? 'Reusable steps' : 'Automation';
  const title =
    editor.automationId === null ? `New ${fallback.toLowerCase()}` : editor.draft.name.trim();
  return (
    <PageHeader
      title={title === '' ? fallback : title}
      {...(editor.status === 'New' ? {} : { subtitle: editor.status })}
      actions={actions}
      overflow={overflow}
    />
  );
}

function Actions({
  editor,
  onTest,
}: {
  readonly editor: Editor;
  readonly onTest: () => void;
}): ReactNode {
  return (
    <View className="flex-row justify-end gap-3">
      <Button
        label="Test run"
        icon="play"
        variant="tonal"
        disabled={!editor.canTest}
        loading={editor.testing}
        onPress={onTest}
      />
      <Button label="Save" icon="check" loading={editor.saving} onPress={editor.save} />
    </View>
  );
}

function useInspector(): {
  readonly selected: string | null;
  readonly open: (id: string) => void;
  readonly close: () => void;
} {
  const focus = useEditorFocus();
  const [selected, setSelected] = useState<string | null>(null);
  const focusedNode = focus.target?.startsWith('node:') === true ? focus.target.slice(5) : null;
  return {
    selected: selected ?? focusedNode,
    open: setSelected,
    close: (): void => {
      if (focusedNode !== null) focus.close();
      setSelected(null);
    },
  };
}

function ProgramTree({
  editor,
  reusable,
  showPreview,
  sentence,
}: {
  readonly editor: Editor;
  readonly reusable: boolean;
  readonly showPreview: boolean;
  readonly sentence: string | null;
}): ReactNode {
  const inspector = useInspector();
  return (
    <StepTreeProvider
      tree={{
        root: editor.draft.automation.steps,
        catalog: editor.catalog,
        problems: editor.problems?.nodes ?? {},
        change: (steps) => {
          editor.change({ type: 'steps', steps });
        },
        open: inspector.open,
      }}
    >
      <EditorBody
        editor={editor}
        reusable={reusable}
        showPreview={showPreview}
        sentence={sentence}
      />
      <StepInspector selected={inspector.selected} onClose={inspector.close} />
    </StepTreeProvider>
  );
}

function Shell({ editor, reusable, takenNames }: ShellProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const { height } = useSizeClass();
  const sentence = previewOf(editor.catalog, editor.draft);
  const body = (
    <ProgramTree
      editor={editor}
      reusable={reusable}
      showPreview={!touch || height === 'compact'}
      sentence={sentence}
    />
  );
  if (editor.embedded)
    return (
      <View className="gap-section-gap">
        {body}
        <Actions editor={editor} onTest={editor.test} />
      </View>
    );
  return (
    <Screen
      maxWidth="reading"
      header={
        <EditorHeader
          editor={editor}
          reusable={reusable}
          takenNames={takenNames}
          touch={touch}
          onTest={editor.test}
        />
      }
      {...(touch
        ? { footer: <FooterBar editor={editor} sentence={sentence} onTest={editor.test} /> }
        : {})}
    >
      {body}
    </Screen>
  );
}

interface AutomationEditorProps {
  readonly start: Draft;
  readonly savedId: string | null;
  readonly revision: number | null;
  readonly reusable: boolean;
  readonly catalog: Catalog;
  readonly takenNames: readonly string[];
}

export function AutomationEditor({
  start,
  savedId,
  revision,
  reusable,
  catalog,
  takenNames,
}: AutomationEditorProps): ReactNode {
  const editor = useEditor({ draft: start, savedId, revision, reusable }, catalog);
  return (
    <EditorFocusProvider>
      <Shell editor={editor} reusable={reusable} takenNames={takenNames} />
    </EditorFocusProvider>
  );
}
