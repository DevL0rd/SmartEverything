import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { HomeMapAnnotation } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import type { IconName } from '../../../../components/icon-glyphs';
import { IconButton } from '../../../../components/icon-button';
import { ListRow } from '../../../../components/list-row';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import {
  keepMeasure,
  markSubtitle,
  markTitle,
  measureReading,
  removeOp,
  type MarkKind,
  type MeasureNotesContext,
} from './measure-notes-model';

const MARK_ICONS: Readonly<Record<HomeMapAnnotation['kind'], IconName>> = {
  measure: 'ruler',
  pin: 'mapPin',
  note: 'fileText',
};

function removeMark(context: MeasureNotesContext, mark: HomeMapAnnotation): void {
  context.edit([removeOp(context.floor.id, mark.id)]);
  if (context.state.picked === mark.id) context.dispatch({ type: 'pick', id: null });
}

function Reading({ context }: { readonly context: MeasureNotesContext }): ReactNode {
  const { from } = context.state;
  const reading = measureReading(context.state);
  return (
    <View className="gap-2 rounded-md bg-surface-2 p-3">
      <View className="flex-row items-center gap-2">
        <Icon name="ruler" size={24} tone="primary" />
        <Text variant="title-2" className="min-w-0 flex-1" accessibilityLiveRegion="polite">
          {reading ?? (from === null ? 'Tap the first point' : 'Tap the second point')}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <Button
          label="Keep on the map"
          icon="mapPin"
          grow
          disabled={reading === null || context.readOnly}
          onPress={(): void => {
            keepMeasure(context);
          }}
        />
        <Button
          label="Clear"
          variant="tonal"
          disabled={from === null}
          onPress={(): void => {
            context.dispatch({ type: 'reset' });
          }}
        />
      </View>
    </View>
  );
}

function MarkList({ context }: { readonly context: MeasureNotesContext }): ReactNode {
  const { floor } = context;
  if (floor.annotations.length === 0) return null;
  return (
    <View accessibilityLabel="Measures and notes" className="gap-1">
      {floor.annotations.map((mark) => {
        const title = markTitle(mark);
        return (
          <ListRow
            key={mark.id}
            icon={MARK_ICONS[mark.kind]}
            title={title}
            subtitle={markSubtitle(floor, mark)}
            selected={context.state.picked === mark.id}
            onPress={(): void => {
              context.dispatch({ type: 'pick', id: mark.id });
            }}
            trailing={
              <IconButton
                icon="trash"
                label={`Delete ${title}`}
                disabled={context.readOnly}
                onPress={(): void => {
                  removeMark(context, mark);
                }}
              />
            }
          />
        );
      })}
    </View>
  );
}

function MarkEditor({
  context,
  mark,
}: {
  readonly context: MeasureNotesContext;
  readonly mark: HomeMapAnnotation;
}): ReactNode {
  const [text, setText] = useState(mark.text);
  const save = (): void => {
    if (context.readOnly || text === mark.text) return;
    context.edit([
      { op: 'update', kind: 'annotation', floorId: context.floor.id, id: mark.id, patch: { text } },
    ]);
  };
  return (
    <View className="gap-3 rounded-md bg-surface-2 p-3">
      <TextField
        label={mark.kind === 'note' ? 'Note' : 'Label'}
        value={text}
        multiline={mark.kind === 'note'}
        disabled={context.readOnly}
        onChange={setText}
        onBlur={save}
        onSubmit={save}
      />
      <Button
        label="Delete"
        icon="trash"
        variant="destructive"
        disabled={context.readOnly}
        onPress={(): void => {
          removeMark(context, mark);
        }}
      />
    </View>
  );
}

const MARK_KINDS: readonly { readonly value: MarkKind; readonly label: string }[] = [
  { value: 'note', label: 'Note' },
  { value: 'pin', label: 'Pin' },
];

function NotesPanel({ context }: { readonly context: MeasureNotesContext }): ReactNode {
  const picked =
    context.floor.annotations.find(
      (mark) => mark.kind !== 'measure' && mark.id === context.state.picked,
    ) ?? null;
  return (
    <View className="gap-3">
      <Segmented
        label="Next tap adds"
        fill
        value={context.state.markKind}
        disabled={context.readOnly}
        options={MARK_KINDS}
        onChange={(kind): void => {
          context.dispatch({ type: 'markKind', kind });
        }}
      />
      {picked === null ? null : <MarkEditor key={picked.id} context={context} mark={picked} />}
      <MarkList context={context} />
    </View>
  );
}

export function MeasureNotesPanel({
  context,
}: {
  readonly context: MeasureNotesContext;
}): ReactNode {
  if (context.mode === 'notes') return <NotesPanel context={context} />;
  return (
    <View className="gap-3">
      <Reading context={context} />
      <MarkList context={context} />
    </View>
  );
}
