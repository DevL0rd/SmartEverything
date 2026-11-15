import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { background } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { DEFAULT_SORT } from '../browser/sort-model';
import { opNoticeOf, type FileOp } from '../source/ops';
import { sameLocation, type FileLocation, type FilePlace, type FileSource } from '../source/types';
import { useSourceAbilities, useSourceFolder, useSourcePlaces } from '../source/source-hooks';
import { PickerBar } from './picker-bar';
import { PickerFooter, type PickerExtra } from './picker-footer';
import { PickerList } from './picker-list';
import {
  choiceViewOf,
  createdLocationOf,
  folderLabelOf,
  pickerRowsOf,
  togglePick,
  writableHereOf,
  type ChoiceView,
  type PickerChoice,
  type PickerHere,
  type PickerMode,
  type PickerRow,
  type PickerRules,
} from './picker-model';

export interface FilePickerProps<O> {
  readonly source: FileSource<O>;
  readonly mode: PickerMode;
  readonly start: FileLocation;
  readonly writableOnly?: boolean;
  readonly refusalOf?: (here: PickerHere<O>) => string | null;
  readonly onChoose: (choice: PickerChoice<O>) => void;
  readonly onCancel?: () => void;
  readonly compact?: boolean;
}

async function createFolder<O>(
  source: FileSource<O>,
  location: FileLocation,
  name: string,
  open: (location: FileLocation) => void,
): Promise<void> {
  const op: FileOp<O> = { kind: 'new_folder', in: location, name };
  const result = await source.run(op);
  const notice = opNoticeOf(op, result);
  const created = createdLocationOf(location, result);
  if (notice.tone !== 'done' || created === null) {
    notify({ message: notice.title, detail: notice.reasons.join('\n'), tone: 'critical' });
    return;
  }
  open(created);
}

interface PickerState<O> {
  readonly here: PickerHere<O>;
  readonly rules: PickerRules;
  readonly places: readonly FilePlace[];
  readonly folder: string;
  readonly view: ChoiceView<O>;
  readonly rows: readonly PickerRow<O>[];
  readonly canCreate: boolean;
  readonly extra: PickerExtra;
  readonly setExtra: (next: PickerExtra) => void;
  readonly setShowHidden: (next: boolean) => void;
  readonly go: (next: FileLocation) => void;
  readonly press: (row: PickerRow<O>) => void;
}

function usePicker<O>(props: FilePickerProps<O>): PickerState<O> {
  const { source, mode, writableOnly = false } = props;
  const [location, setLocation] = useState(props.start);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [extra, setExtra] = useState<PickerExtra>('none');
  const abilities = useSourceAbilities(source, location);
  const places = useSourcePlaces(source);
  const listing = useSourceFolder(source, location, DEFAULT_SORT);
  const rules = { mode, writableOnly, showHidden };
  const writable = writableHereOf(listing, abilities.newFolder || abilities.upload);
  const here: PickerHere<O> = { location, listing, abilities, writable };
  const folder = folderLabelOf(listing.crumbs, source.label);
  const refusal = props.refusalOf?.(here) ?? null;
  const go = (next: FileLocation): void => {
    if (sameLocation(next, location)) return;
    setLocation(next);
    setPicked([]);
  };
  return {
    here,
    rules,
    places: abilities.places ? places.filter((place) => place.kind !== 'trash') : [],
    folder,
    view: choiceViewOf({ here, rules, picked, refusal, fallback: folder }),
    rows: pickerRowsOf(listing.entries, rules, picked),
    canCreate: mode === 'folder' && abilities.newFolder && writable,
    extra,
    setExtra,
    setShowHidden,
    go,
    press: (row): void => {
      if (row.opens) go({ place: location.place, folder: row.node.key });
      else setPicked((current) => togglePick(current, row.node, rules));
    },
  };
}

function Footer<O>({
  picker,
  state,
}: {
  readonly picker: FilePickerProps<O>;
  readonly state: PickerState<O>;
}): ReactNode {
  const { source, compact = false, onChoose, onCancel } = picker;
  const { here, view } = state;
  return (
    <PickerFooter
      view={view}
      folder={state.folder}
      taken={new Set(here.listing.entries.map((node) => node.name))}
      canCreate={state.canCreate}
      locationOf={here.abilities.pathEntry ? source.locationOf : null}
      compact={compact}
      extra={state.extra}
      onExtra={state.setExtra}
      onGo={state.go}
      onCreate={(name) => {
        background(
          createFolder(source, here.location, name, state.go),
          'files.picker_new_folder_failed',
        );
      }}
      onChoose={() => {
        if (view.choice !== null) onChoose(view.choice);
      }}
      onCancel={onCancel}
    />
  );
}

export function FilePicker<O>(props: FilePickerProps<O>): ReactNode {
  const compact = props.compact ?? false;
  const state = usePicker(props);
  const { here, rules } = state;
  const footer = <Footer picker={props} state={state} />;
  if (compact && state.extra !== 'none') {
    return (
      <ScrollView className="min-h-0 shrink grow-0" keyboardShouldPersistTaps="handled">
        {footer}
      </ScrollView>
    );
  }
  return (
    <View className={cn('min-h-0', compact ? 'shrink' : 'flex-1')}>
      <PickerBar
        places={state.places}
        crumbs={here.listing.crumbs}
        place={here.location.place}
        hidden={
          here.abilities.hidden ? { shown: rules.showHidden, onChange: state.setShowHidden } : null
        }
        compact={compact}
        onGo={state.go}
      />
      <View
        className={cn('min-h-0 border-t border-outline-variant', compact ? 'shrink' : 'flex-1')}
      >
        <PickerList
          listing={here.listing}
          rows={state.rows}
          mode={rules.mode}
          canCreate={state.canCreate}
          compact={compact}
          onPress={state.press}
        />
      </View>
      {footer}
    </View>
  );
}
