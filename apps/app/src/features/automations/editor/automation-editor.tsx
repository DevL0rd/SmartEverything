import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Section, List } from '../../../components/section';
import type { MenuItem } from '../../../components/menu';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { SwitchRow } from '../../../components/rows';
import { Screen } from '../../../components/screen';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import { duplicateAutomation } from '../data/actions';
import type { Catalog } from '../data/use-automations';
import { summarize, sentenceOf } from '../model/describe';
import type { Draft } from '../model/editor-state';
import { OnlyIfBlock, ThenBlock, WhenBlock } from './blocks';
import { OwnedRunSheet } from '../components/owned-runs';
import { RunPolicyFields } from './run-policy-fields';
import { EditorFocusProvider, FocusedFields, focusedField, useEditorFocus } from './editor-focus';
import { automationEditorField } from '../model/focus-targets';
import { FocusedRun } from './focused-run';
import { ProgramConditionFields } from './program-conditions';
import { ProgramLibraryProvider } from './program-library';
import { useReloadSaved } from './editor-navigation';
import { useEditor, type Editor } from './use-editor';

function previewOf(catalog: Catalog, draft: Draft): string | null {
  return sentenceOf(
    summarize(catalog.names, {
      triggers: [...draft.triggers],
      conditions: { mode: draft.mode, items: [...draft.conditions] },
      actions: [...draft.actions],
    }),
  );
}

interface PreviewProps {
  readonly sentence: string | null;
}

function Preview({ sentence }: PreviewProps): ReactNode {
  return (
    <View accessibilityLiveRegion="polite" className="flex-row items-start gap-3">
      <Icon name="sparkles" size={20} tone="primary" />
      <Text
        variant="body"
        tone={sentence === null ? 'faint' : 'default'}
        numberOfLines={3}
        className="flex-1"
      >
        {sentence ?? 'Pick when it runs and what it does.'}
      </Text>
    </View>
  );
}

interface NameBlockProps {
  readonly editor: Editor;
  readonly focused?: boolean;
}

function NameBlock({ editor, focused }: NameBlockProps): ReactNode {
  return (
    <View className="gap-3">
      <TextField
        label="Name"
        focusOnMount={focused === true}
        value={editor.draft.name}
        placeholder="Bedtime air"
        error={editor.problems?.name[0] ?? null}
        onChange={(name) => {
          editor.change({ type: 'rename', name });
        }}
      />
      <List>
        <SwitchRow
          title="On"
          subtitle={editor.draft.enabled ? 'Runs when triggered' : 'Paused. It won’t run.'}
          value={editor.draft.enabled}
          onChange={(enabled) => {
            editor.change({ type: 'enable', enabled });
          }}
        />
      </List>
    </View>
  );
}

interface FooterBarProps {
  readonly editor: Editor;
  readonly sentence: string | null;
}

function FooterBar({ editor, sentence }: FooterBarProps): ReactNode {
  const { height, width } = useSizeClass();
  return (
    <View className="w-full max-w-reading gap-3 self-center">
      {height === 'compact' ? null : <Preview sentence={sentence} />}
      <View className="flex-row justify-end gap-3">
        <Button
          label={editor.testLabel}
          icon="play"
          variant="tonal"
          disabled={!editor.canTest}
          loading={editor.testing}
          onPress={editor.test}
        />
        <Button
          label="Save"
          icon="check"
          grow={width === 'compact'}
          loading={editor.saving}
          onPress={editor.save}
        />
      </View>
    </View>
  );
}

function useOverflow(editor: Editor, takenNames: readonly string[]): MenuItem[] {
  const router = useRouter();
  const { automationId, validation } = editor;
  const reload = useReloadSaved();
  if (automationId === null) {
    return [];
  }
  return [
    { label: 'Reload saved', icon: 'refresh', onPress: reload },
    {
      label: 'Run history',
      icon: 'activity',
      onPress: (): void => {
        router.push(href.automationRuns(automationId));
      },
    },
    {
      label: 'Duplicate',
      icon: 'copy',
      disabled: !validation.valid,
      onPress: (): void => {
        if (validation.valid) {
          duplicateAutomation({ ...validation, enabled: editor.draft.enabled }, takenNames);
        }
      },
    },
    { label: 'Delete', icon: 'trash', destructive: true, onPress: editor.remove },
  ];
}

interface EditorHeaderProps {
  readonly editor: Editor;
  readonly takenNames: readonly string[];
  readonly touch: boolean;
}

function EditorHeader({ editor, takenNames, touch }: EditorHeaderProps): ReactNode {
  const overflow = useOverflow(editor, takenNames);
  const actions: HeaderAction[] = touch
    ? []
    : [
        ...(editor.canTest
          ? [{ icon: 'play', label: editor.testLabel, onPress: editor.test } as const]
          : []),
        { icon: 'check', label: 'Save', onPress: editor.save, primary: true },
      ];
  const title = editor.automationId === null ? 'New automation' : editor.draft.name.trim();
  return (
    <PageHeader
      title={title === '' ? 'Automation' : title}
      {...(editor.status === 'New' ? {} : { subtitle: editor.status })}
      actions={actions}
      overflow={overflow}
    />
  );
}

interface EditorBodyProps {
  readonly editor: Editor;
  readonly catalog: Catalog;
  readonly showPreview: boolean;
  readonly sentence: string | null;
}
function UndoActions({ editor }: NameBlockProps): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
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
function EditorPolicy({ editor, focused }: NameBlockProps): ReactNode {
  return (
    <Section title="Run behavior">
      <RunPolicyFields
        focusControlKey={focused === true}
        policy={editor.draft.runPolicy}
        controlKey={editor.draft.controlKey}
        onChange={(runPolicy, controlKey) => {
          editor.change({ type: 'policy', runPolicy, controlKey });
        }}
      />
    </Section>
  );
}
function testExplanation(editor: Editor): string {
  if (editor.status === 'Saved')
    return 'Test run executes saved actions now, including waits and AI steps.';
  return editor.canTest
    ? 'Draft tests send commands and skip waits and AI steps.'
    : 'Save this program before testing. Tests run saved steps, including branches, waits and AI.';
}
function EditorBody({ editor, catalog, showPreview, sentence }: EditorBodyProps): ReactNode {
  const blocks = { draft: editor.draft, change: editor.change, catalog, problems: editor.problems };
  return (
    <>
      {showPreview ? (
        <Card>
          <Preview sentence={sentence} />
        </Card>
      ) : null}
      <NameBlock editor={editor} />
      <WhenBlock {...blocks} />
      <OnlyIfBlock {...blocks} />
      <UndoActions editor={editor} />
      <ThenBlock {...blocks} />
      <EditorPolicy editor={editor} />
      <Text variant="footnote" tone="variant" className="px-4">
        {testExplanation(editor)}
      </Text>
      <AutomationFocus editor={editor} catalog={catalog} />
      <OwnedRunSheet run={editor.run} onClose={editor.closeRun} />
    </>
  );
}

interface AutomationFocusProps {
  readonly editor: Editor;
  readonly catalog: Catalog;
}
function FocusedCondition({ editor, catalog }: AutomationFocusProps): ReactNode {
  const focus = useEditorFocus();
  const target = focus.target;
  const index =
    target?.startsWith('condition:') === true ? Number(target.slice('condition:'.length)) : null;
  const condition = index === null ? undefined : editor.draft.conditions[index];
  if (condition === undefined || index === null)
    return (
      <OnlyIfBlock
        draft={editor.draft}
        change={editor.change}
        catalog={catalog}
        problems={editor.problems}
      />
    );
  return (
    <ProgramConditionFields
      condition={condition}
      catalog={catalog}
      onChange={(next) => {
        editor.change({ type: 'conditions', change: { kind: 'set', index, item: next } });
      }}
    />
  );
}
function AutomationFocusedFields({ editor, catalog }: AutomationFocusProps): ReactNode {
  const { target } = useEditorFocus();
  const field = focusedField(target);
  const blocks = { draft: editor.draft, change: editor.change, catalog, problems: editor.problems };
  if (target?.startsWith('condition:') === true)
    return <FocusedCondition editor={editor} catalog={catalog} />;
  if (!automationEditorField(field)) return null;
  switch (field) {
    case 'name':
      return <NameBlock editor={editor} focused />;
    case 'when':
      return <WhenBlock {...blocks} />;
    case 'conditions':
      return <FocusedCondition editor={editor} catalog={catalog} />;
    case 'steps':
      return <ThenBlock {...blocks} />;
    case 'policy':
      return <EditorPolicy editor={editor} />;
    case 'controlKey':
      return <EditorPolicy editor={editor} focused />;
  }
}
function AutomationFocus(props: AutomationFocusProps): ReactNode {
  const focus = useEditorFocus();
  const field =
    focus.target?.startsWith('condition:') === true ? 'conditions' : focusedField(focus.target);
  return (
    <>
      <FocusedFields field={field}>
        <AutomationFocusedFields {...props} />
      </FocusedFields>
      <FocusedRun />
    </>
  );
}

interface AutomationEditorProps {
  readonly start: Draft;
  readonly savedId: string | null;
  readonly revision: string | null;
  readonly catalog: Catalog;
  readonly takenNames: readonly string[];
}

export function AutomationEditor({
  start,
  savedId,
  revision,
  catalog,
  takenNames,
}: AutomationEditorProps): ReactNode {
  const editor = useEditor(start, savedId, catalog, revision);
  const touch = useIdiom() === 'touch';
  const { height } = useSizeClass();
  const sentence = previewOf(catalog, editor.draft);
  return (
    <EditorFocusProvider>
      <ProgramLibraryProvider>
        <Screen
          maxWidth="reading"
          header={<EditorHeader editor={editor} takenNames={takenNames} touch={touch} />}
          {...(touch ? { footer: <FooterBar editor={editor} sentence={sentence} /> } : {})}
        >
          <EditorBody
            editor={editor}
            catalog={catalog}
            showPreview={!touch || height === 'compact'}
            sentence={sentence}
          />
        </Screen>
      </ProgramLibraryProvider>
    </EditorFocusProvider>
  );
}
