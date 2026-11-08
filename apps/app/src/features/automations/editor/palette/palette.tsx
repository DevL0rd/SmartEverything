import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { pointRect } from '../../../../components/anchor';
import { Popover } from '../../../../components/popover';
import { Sheet } from '../../../../components/sheet';
import { SheetHeader } from '../../../../components/sheet-header';
import { Text } from '../../../../components/text';
import { useIsPhone } from '../../../../design/size-class';
import { useDevices } from '../../../../store/selectors';
import { useCatalog } from '../../data/use-catalog';
import { useAutomationPrefs } from '../../data/use-automation-prefs';
import { useAutomationsSource } from '../../data/source';
import {
  anchorOf,
  insertPointText,
  paletteOpen,
  filterPinOf,
  type InsertState,
  type ScreenPoint,
} from './armed-insert';
import {
  NEW_REUSABLE_ENTRY,
  functionEntry,
  paletteGroups,
  shippedNodeEntries,
  type PaletteChoice,
  type PaletteEntry,
  type PaletteGroup,
} from './palette-categories';
import { PaletteBody } from './palette-body';
import { NO_USAGE, type PaletteContext, type PaletteUsage } from './palette-search';
import { filterEntriesForPin, type PinSource } from './pin-filter';
import { presetEntries } from './presets';
import { snippetEntries } from './snippets';

export interface PaletteProps {
  readonly state: InsertState;
  readonly context: PaletteContext;
  readonly onChoose: (choice: PaletteChoice) => void;
  readonly onClose: () => void;
}

interface PaletteModel {
  readonly entries: readonly PaletteEntry[];
  readonly groups: readonly PaletteGroup[];
}

const DROP_PICKER = { width: 360, height: 480 } as const;

const FAVOURITES_FULL = 'Favourites are full. Remove one to add another.';
const PREFS_INVALID = 'Your saved palette could not be read, so it cannot be changed right now.';

export function usePaletteEntries(): readonly PaletteEntry[] {
  const { kinds } = useAutomationsSource();
  const { functions } = useCatalog();
  const devices = useDevices();
  return useMemo(
    () => [
      ...shippedNodeEntries(kinds),
      ...presetEntries(),
      ...functions.map(functionEntry),
      NEW_REUSABLE_ENTRY,
      ...snippetEntries(devices),
    ],
    [kinds, functions, devices],
  );
}

export function usePaletteModel(pin: PinSource | null): PaletteModel {
  const { lookup } = useAutomationsSource();
  const all = usePaletteEntries();
  return useMemo(() => {
    const entries = pin === null ? all : filterEntriesForPin(all, pin, lookup);
    return { entries, groups: paletteGroups(entries) };
  }, [all, lookup, pin]);
}

function PaletteContent({
  context,
  pin,
  onChoose,
}: Pick<PaletteProps, 'context' | 'onChoose'> & { readonly pin: PinSource | null }): ReactNode {
  const { entries, groups } = usePaletteModel(pin);
  const prefs = useAutomationPrefs();
  const read = prefs.palette;
  const usage = useMemo<PaletteUsage>(
    () => (read.status === 'invalid' ? NO_USAGE : read.value),
    [read],
  );
  const [note, setNote] = useState<string | null>(null);
  const onPick = useCallback(
    (entry: PaletteEntry) => {
      if (entry.usageId !== null) prefs.recordRecentKind(entry.usageId);
      onChoose(entry.choice);
    },
    [prefs, onChoose],
  );
  const onToggleFavourite = useCallback(
    (entry: PaletteEntry) => {
      if (entry.usageId === null) return;
      const outcome = prefs.toggleFavouriteKind(entry.usageId);
      setNote(outcome === 'saved' ? null : outcome === 'full' ? FAVOURITES_FULL : PREFS_INVALID);
    },
    [prefs],
  );
  return (
    <PaletteBody
      entries={entries}
      groups={groups}
      context={context}
      usage={usage}
      note={read.status === 'invalid' ? PREFS_INVALID : note}
      onPick={onPick}
      onToggleFavourite={onToggleFavourite}
    />
  );
}

function DropPicker(props: PaletteProps & { readonly anchor: ScreenPoint }): ReactNode {
  return (
    <Popover
      open
      onClose={props.onClose}
      anchor={pointRect(props.anchor.x, props.anchor.y)}
      label="Add a step"
      width={DROP_PICKER.width}
      height={DROP_PICKER.height}
      scroll={false}
      className="pt-3"
    >
      <PaletteContent
        context={props.context}
        pin={filterPinOf(props.state)}
        onChoose={props.onChoose}
      />
    </Popover>
  );
}

export function Palette(props: PaletteProps): ReactNode {
  const phone = useIsPhone();
  const open = paletteOpen(props.state);
  if (!open) return null;
  const armed = insertPointText(props.state);
  const anchor = anchorOf(props.state);
  if (!phone && anchor !== null) return <DropPicker {...props} anchor={anchor} />;
  if (phone) {
    return (
      <Sheet open onClose={props.onClose} title="Add" label="Add a step">
        {armed === null ? null : (
          <Text variant="footnote" tone="variant" className="px-4 pb-2">
            {armed}
          </Text>
        )}
        <PaletteContent
          context={props.context}
          pin={filterPinOf(props.state)}
          onChoose={props.onChoose}
        />
      </Sheet>
    );
  }
  return (
    <View
      accessibilityLabel="Add a step"
      className="h-full w-inspector max-w-full border-l border-outline-variant bg-surface-raised"
    >
      <View className="pt-4">
        <SheetHeader title="Add" onClose={props.onClose} touch={false} />
      </View>
      {armed === null ? null : (
        <Text variant="footnote" tone="variant" className="px-4 pb-2">
          {armed}
        </Text>
      )}
      <PaletteContent
        context={props.context}
        pin={filterPinOf(props.state)}
        onChoose={props.onChoose}
      />
    </View>
  );
}
