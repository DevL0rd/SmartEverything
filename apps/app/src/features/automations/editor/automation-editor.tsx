import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { List } from '../../../components/section';
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

function Preview({ sentence }: { readonly sentence: string | null }): ReactNode {
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

function NameBlock({ editor }: { readonly editor: Editor }): ReactNode {
  return (
    <View className="gap-3">
      <TextField
        label="Name"
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

function FooterBar({
  editor,
  sentence,
}: {
  readonly editor: Editor;
  readonly sentence: string | null;
}): ReactNode {
  const { height, width } = useSizeClass();
  return (
    <View className="w-full max-w-reading gap-3 self-center">
      {height === 'compact' ? null : <Preview sentence={sentence} />}
      <View className="flex-row justify-end gap-3">
        <Button
          label="Test run"
          icon="play"
          variant="tonal"
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
  if (automationId === null) {
    return [];
  }
  return [
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

function EditorHeader({
  editor,
  takenNames,
  touch,
}: {
  readonly editor: Editor;
  readonly takenNames: readonly string[];
  readonly touch: boolean;
}): ReactNode {
  const overflow = useOverflow(editor, takenNames);
  const actions: HeaderAction[] = touch
    ? []
    : [
        { icon: 'play', label: 'Test run', onPress: editor.test },
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

export function AutomationEditor({
  start,
  savedId,
  catalog,
  takenNames,
}: {
  readonly start: Draft;
  readonly savedId: string | null;
  readonly catalog: Catalog;
  readonly takenNames: readonly string[];
}): ReactNode {
  const editor = useEditor(start, savedId, catalog);
  const touch = useIdiom() === 'touch';
  const { height } = useSizeClass();
  const sentence = previewOf(catalog, editor.draft);
  const blocks = {
    draft: editor.draft,
    change: editor.change,
    catalog,
    problems: editor.problems,
  };
  return (
    <Screen
      maxWidth="reading"
      header={<EditorHeader editor={editor} takenNames={takenNames} touch={touch} />}
      {...(touch ? { footer: <FooterBar editor={editor} sentence={sentence} /> } : {})}
    >
      {touch && height !== 'compact' ? null : (
        <Card>
          <Preview sentence={sentence} />
        </Card>
      )}
      <NameBlock editor={editor} />
      <WhenBlock {...blocks} />
      <OnlyIfBlock {...blocks} />
      <ThenBlock {...blocks} />
      <Text variant="footnote" tone="variant" className="px-4">
        {editor.status === 'Saved'
          ? 'Test run executes saved actions now, including waits and AI steps.'
          : 'Draft tests send commands and skip waits and AI steps.'}
      </Text>
    </Screen>
  );
}
