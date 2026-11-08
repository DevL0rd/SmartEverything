import { memo, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { cn } from '../../../../design/cn';
import { useIdiom } from '../../../../design/platform';
import { Badge } from '../../../../components/badge';
import { Button } from '../../../../components/button';
import { IconButton } from '../../../../components/icon-button';
import { Interactive } from '../../../../components/interactive';
import { OverflowButton, type MenuItem } from '../../../../components/menu';
import { Text } from '../../../../components/text';
import { Tooltip } from '../../../../components/tooltip';
import type { ProblemCounts } from '../problems/problem-model';
import {
  EMPTY_TEST_REASON,
  topBarModel,
  type EditorLayout,
  type TopBarModel,
} from './screen-model';

export interface TopBarProps {
  readonly layout: EditorLayout;
  readonly name: string;
  readonly status: string;
  readonly reusable: boolean;
  readonly online: boolean;
  readonly empty: boolean;
  readonly counts: ProblemCounts;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onBack: () => void;
  readonly onRename: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onPublish: () => void;
  readonly onTest: () => void;
  readonly onAdd: () => void;
  readonly onProblems: () => void;
  readonly onShortcuts: () => void;
  readonly focusRef?: RefObject<View | null>;
}

function PublishButton({
  model,
  onPress,
}: {
  readonly model: TopBarModel;
  readonly onPress: () => void;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const [hovered, setHovered] = useState(false);
  const { publishDisabled, publishName, publishLabel } = model;
  return (
    <View
      className="relative"
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
    >
      <Interactive
        label={publishName}
        disabled={publishDisabled}
        onPress={onPress}
        onTone="primary"
        className={cn(
          'min-h-touch-min items-center justify-center rounded-full px-4',
          publishDisabled ? 'bg-on-surface/10' : 'bg-primary',
        )}
        layerClassName="rounded-full"
      >
        <Text variant="label" tone={publishDisabled ? 'faint' : 'onPrimary'} numberOfLines={1}>
          {publishLabel}
        </Text>
      </Interactive>
      {pointer && hovered && publishDisabled ? <Tooltip text={publishName} /> : null}
    </View>
  );
}

function ProblemChip({
  model,
  counts,
  compact,
  onPress,
}: {
  readonly model: TopBarModel;
  readonly counts: ProblemCounts;
  readonly compact: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const { problemText, problemTone } = model;
  if (problemText === null || problemTone === null) return null;
  const total = counts.errors + counts.warnings + counts.hints;
  return (
    <Interactive
      label={`Problems: ${problemText}`}
      hint="Opens the problems list"
      onPress={onPress}
      className="min-h-touch-min min-w-touch-min items-center justify-center rounded-full"
    >
      <Badge label={compact ? String(total) : problemText} tone={problemTone} icon="warning" />
    </Interactive>
  );
}

function Title({
  bar,
  model,
}: {
  readonly bar: TopBarProps;
  readonly model: TopBarModel;
}): ReactNode {
  const { layout, name, status, reusable, onRename } = bar;
  const compact = layout !== 'wide';
  return (
    <View className="min-w-0 shrink flex-1">
      {model.breadcrumb ? (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {reusable ? 'Custom Nodes' : 'Automations'} › {name}
        </Text>
      ) : null}
      <Interactive
        label={compact ? `Name: ${name}, ${status}. Rename` : `Name: ${name}. Rename`}
        onPress={onRename}
        className={cn('justify-center', compact ? 'min-h-touch-min' : 'min-h-6')}
      >
        <Text variant="body-strong" numberOfLines={1}>
          {name}
        </Text>
        {compact ? (
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {status}
          </Text>
        ) : null}
      </Interactive>
    </View>
  );
}

function moreItems(bar: TopBarProps, model: TopBarModel): readonly MenuItem[] {
  const test: readonly MenuItem[] = model.testButton
    ? []
    : [{ label: 'Test', icon: 'play', disabled: model.testDisabled, onPress: bar.onTest }];
  return [
    ...test,
    { label: 'Rename', icon: 'pencil', onPress: bar.onRename },
    { label: 'Shortcuts', icon: 'keyboard', shortcut: '?', onPress: bar.onShortcuts },
  ];
}

function UndoRedo({ bar }: { readonly bar: TopBarProps }): ReactNode {
  return (
    <>
      <IconButton
        icon="undo"
        label="Undo"
        shortcut="Ctrl+Z"
        disabled={!bar.canUndo}
        onPress={bar.onUndo}
      />
      <IconButton
        icon="redo"
        label="Redo"
        shortcut="Ctrl+Shift+Z"
        disabled={!bar.canRedo}
        onPress={bar.onRedo}
      />
    </>
  );
}

function Actions({
  bar,
  model,
}: {
  readonly bar: TopBarProps;
  readonly model: TopBarModel;
}): ReactNode {
  return (
    <View className="shrink-0 flex-row items-center gap-1">
      {model.undoButtons ? <UndoRedo bar={bar} /> : null}
      {model.addButton ? (
        <Button label="Add" icon="plus" variant="outlined" hint="Add a step" onPress={bar.onAdd} />
      ) : null}
      {model.testButton ? (
        <Button
          label="Test"
          icon="play"
          variant="tonal"
          hint={model.testDisabled ? EMPTY_TEST_REASON : 'Test run. Ctrl+Enter'}
          disabled={model.testDisabled}
          onPress={bar.onTest}
        />
      ) : null}
      <PublishButton model={model} onPress={bar.onPublish} />
      <OverflowButton items={moreItems(bar, model)} label="More" />
    </View>
  );
}

export const TopBar = memo(function TopBar({ focusRef, ...props }: TopBarProps): ReactNode {
  const model = topBarModel(props);
  return (
    <View
      ref={focusRef}
      accessibilityRole="toolbar"
      accessibilityLabel="Editor"
      className="flex-row items-center gap-1 border-b border-outline-variant bg-surface-1 px-2 py-1"
    >
      <IconButton icon="arrowLeft" label="Back" onPress={props.onBack} />
      <Title bar={props} model={model} />
      {props.layout !== 'wide' ? null : (
        <View className="self-center">
          <Badge label={props.status} tone="neutral" />
        </View>
      )}
      <ProblemChip
        model={model}
        counts={props.counts}
        compact={props.layout !== 'wide'}
        onPress={props.onProblems}
      />
      <Actions bar={props} model={model} />
    </View>
  );
});

export const SentenceStrip = memo(function SentenceStrip({
  text,
}: {
  readonly text: string | null;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (text === null) return null;
  return (
    <Interactive
      label={open ? 'Shorten the description' : 'Show the whole description'}
      onPress={() => {
        setOpen((current) => !current);
      }}
      className="border-b border-outline-variant bg-surface-2 px-4 py-2"
    >
      <Text variant="callout" numberOfLines={open ? undefined : 2}>
        {text}
      </Text>
    </Interactive>
  );
});
