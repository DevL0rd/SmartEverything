import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { Sheet } from '../../../../components/sheet';
import { SheetHeader } from '../../../../components/sheet-header';
import { Text } from '../../../../components/text';
import { useIsPhone } from '../../../../design/size-class';
import { useDevices, useIsOwner } from '../../../../store/selectors';
import { useCatalog } from '../../data/use-catalog';
import { useAutomationPrefs } from '../../data/use-automation-prefs';
import { useAutomationsSource } from '../../data/source';
import { insertPointText, paletteOpen, type InsertState } from './armed-insert';
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

const FAVOURITES_FULL = 'Favourites are full. Remove one to add another.';
const PREFS_INVALID = 'Your saved palette could not be read, so it cannot be changed right now.';

export function usePaletteModel(): PaletteModel {
  const { kinds } = useAutomationsSource();
  const { functions } = useCatalog();
  const devices = useDevices();
  const isOwner = useIsOwner();
  const hasComputer = devices.some((device) => device.kind === 'computer');
  return useMemo(() => {
    const env = { isOwner, hasComputer };
    const entries = [
      ...shippedNodeEntries(kinds, env),
      ...presetEntries(),
      ...functions.map(functionEntry),
      NEW_REUSABLE_ENTRY,
      ...snippetEntries(devices),
    ];
    return { entries, groups: paletteGroups(entries) };
  }, [kinds, functions, devices, isOwner, hasComputer]);
}

function PaletteContent({
  context,
  onChoose,
}: Pick<PaletteProps, 'context' | 'onChoose'>): ReactNode {
  const { entries, groups } = usePaletteModel();
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

export function Palette(props: PaletteProps): ReactNode {
  const phone = useIsPhone();
  const open = paletteOpen(props.state);
  if (!open) return null;
  const armed = insertPointText(props.state);
  if (phone) {
    return (
      <Sheet open onClose={props.onClose} title="Add" label="Add a step">
        {armed === null ? null : (
          <Text variant="footnote" tone="variant" className="px-4 pb-2">
            {armed}
          </Text>
        )}
        <PaletteContent context={props.context} onChoose={props.onChoose} />
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
      <PaletteContent context={props.context} onChoose={props.onChoose} />
    </View>
  );
}

export function PlacingBanner({
  state,
  onCancel,
}: {
  readonly state: InsertState;
  readonly onCancel: () => void;
}): ReactNode {
  const text = state.phase === 'placing' ? insertPointText(state) : null;
  if (text === null) return null;
  return (
    <View
      accessibilityRole="alert"
      className="flex-row items-center gap-3 rounded-md bg-primary-container px-4 py-2"
    >
      <Text variant="callout" tone="onPrimaryContainer" className="flex-1">
        {text}
      </Text>
      <Button label="Cancel" variant="text" onPress={onCancel} />
    </View>
  );
}
