import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { List } from '../../../components/section';
import type { MenuItem } from '../../../components/menu';
import { SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useSizeClass } from '../../../design/size-class';
import { duplicateAutomation } from '../data/actions';
import type { Catalog } from '../data/use-automations';
import { sentenceOf, summarize } from '../model/describe';
import { authorLine } from '../model/automation-author';
import type { Draft } from '../model/editor-state';
import { useReloadSaved } from './editor-navigation';
import type { Editor } from './use-editor';

export function previewOf(catalog: Catalog, draft: Draft): string | null {
  return sentenceOf(summarize(catalog.names, draft.automation));
}

export function Preview({ sentence }: { readonly sentence: string | null }): ReactNode {
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

function MadeBy({ editor }: { readonly editor: Editor }): ReactNode {
  const row = editor.catalog.automations.find((entry) => entry.id === editor.automationId);
  return row === undefined ? null : (
    <Text variant="footnote" tone="variant">
      {authorLine(row, editor.catalog.people)}
    </Text>
  );
}

export function NameBlock({
  editor,
  focused,
  reusable,
}: {
  readonly editor: Editor;
  readonly focused?: boolean;
  readonly reusable: boolean;
}): ReactNode {
  return (
    <View className="gap-3">
      <TextField
        label="Name"
        focusOnMount={focused === true}
        value={editor.draft.name}
        placeholder={reusable ? 'Fade the lights' : 'Bedtime air'}
        error={editor.problems?.name[0] ?? null}
        onChange={(name) => {
          editor.change({ type: 'rename', name });
        }}
      />
      <MadeBy editor={editor} />
      {reusable ? null : (
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
      )}
    </View>
  );
}

export function TestNote(): ReactNode {
  return (
    <Text variant="footnote" tone="variant" className="px-4">
      Test runs this draft on your home now, including waits and AI steps.
    </Text>
  );
}

export function FooterBar({
  editor,
  sentence,
  onTest,
}: {
  readonly editor: Editor;
  readonly sentence: string | null;
  readonly onTest: () => void;
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
          disabled={!editor.canTest}
          loading={editor.testing}
          onPress={onTest}
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

export function useOverflow(editor: Editor, takenNames: readonly string[]): MenuItem[] {
  const router = useRouter();
  const reload = useReloadSaved();
  const { automationId, validation } = editor;
  const redo: MenuItem[] = editor.redo === null ? [] : [{ label: 'Redo', onPress: editor.redo }];
  if (automationId === null) return redo;
  return [
    ...redo,
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
          duplicateAutomation(
            {
              name: validation.name,
              enabled: editor.draft.enabled,
              definition: validation.automation,
            },
            takenNames,
          );
        }
      },
    },
    { label: 'Delete', icon: 'trash', destructive: true, onPress: editor.remove },
  ];
}
