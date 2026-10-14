import type { ShellyArea } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { TextField } from '../../components/text-field';
import { Text } from '../../components/text';
import { GridPainter } from './grid-painter';
import { useAreaDraft, type AreaControls } from './use-area-draft';

const COORDINATES = ['X start', 'Y start', 'X end', 'Y end'] as const;

function SegmentEditor({
  segment,
  index,
  change,
  remove,
}: {
  readonly segment: readonly string[];
  readonly index: number;
  readonly change: (value: readonly string[]) => void;
  readonly remove: () => void;
}): ReactNode {
  return (
    <View className="gap-2 rounded-md bg-surface-2 p-3">
      <Text variant="body-strong">Segment {String(index + 1)}</Text>
      <View className="flex-row flex-wrap gap-3">
        {COORDINATES.map((label, at) => {
          const draft = segment[at] ?? '';
          const valid = draft.trim() !== '' && Number.isSafeInteger(Number(draft));
          return (
            <View key={label} className="min-w-24 flex-1">
              <TextField
                label={`${label} · segment ${String(index + 1)}`}
                kind="number"
                value={draft}
                onChange={(value) => {
                  change(segment.map((entry, n) => (n === at ? value : entry)));
                }}
                error={valid ? null : 'Use an exact integer endpoint'}
              />
            </View>
          );
        })}
      </View>
      <Button label="Remove segment" variant="text" icon="minus" onPress={remove} />
    </View>
  );
}

function AreaActions({ draft }: { readonly draft: AreaControls }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Add segment"
        icon="plus"
        variant="tonal"
        onPress={() => {
          draft.set([...draft.value, ['0', '0', '0', '0']]);
        }}
      />
      <Button
        label="Undo"
        icon="undo"
        variant="text"
        disabled={!draft.canUndo}
        onPress={draft.undo}
      />
      <Button label="Redo" variant="text" disabled={!draft.canRedo} onPress={draft.redo} />
    </View>
  );
}

export function AreaEditor({
  value,
  change,
  validity,
  context,
  allowed,
  origin,
}: {
  readonly value: ShellyArea;
  readonly change: (value: ShellyArea) => void;
  readonly validity: (valid: boolean) => void;
  readonly context?: ShellyArea;
  readonly allowed?: ShellyArea;
  readonly origin?: number;
}): ReactNode {
  const draft = useAreaDraft(value, change, validity);
  return (
    <View className="gap-3">
      <GridPainter
        area={value}
        {...(context === undefined ? {} : { context })}
        {...(allowed === undefined ? {} : { allowed })}
        {...(origin === undefined ? {} : { origin })}
        disabled={draft.value.some((segment) =>
          segment.some((part) => part.trim() === '' || !Number.isSafeInteger(Number(part))),
        )}
        change={(next) => {
          draft.set(next.map((segment) => segment.map(String)));
        }}
      />
      <Text variant="footnote" tone="variant">
        Exact boundary endpoints · imported segments stay unchanged until edited.
      </Text>
      {draft.value.map((segment, index) => (
        <SegmentEditor
          key={index}
          segment={segment}
          index={index}
          change={(next) => {
            draft.set(draft.value.map((item, at) => (at === index ? next : item)));
          }}
          remove={() => {
            draft.set(draft.value.filter((_, at) => at !== index));
          }}
        />
      ))}
      <AreaActions draft={draft} />
    </View>
  );
}
