import type { ReactNode } from 'react';
import { SelectRow } from '../../../components/rows';
import { saveFlags, savedFlags } from '../../../developer/boot';
import type { StoredFlags } from '../../../developer/toggles';
import {
  SHIP_LEVEL_TEXT,
  SHIP_LEVEL_CHOICES,
  shipLevelOf,
  withShipLevel,
  type ShipLevel,
} from '../../../platform/ship-level';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';

const selectSaved = (state: StoreState): StoredFlags => savedFlags(state.tables.layouts);

const selectShipLevel = (state: StoreState): ShipLevel => shipLevelOf(selectSaved(state));

const OPTIONS = SHIP_LEVEL_CHOICES.map((level) => ({
  value: level,
  label: { warn: 'Warnings and errors', info: 'Info', debug: 'Debug', trace: 'Trace' }[level],
  description: SHIP_LEVEL_TEXT[level],
  wrapDescription: true,
}));

export function ShipLevelRow(): ReactNode {
  const store = useEntityStore();
  const chosen = useStoreSelector(selectShipLevel);
  return (
    <SelectRow
      title="Hub log detail"
      subtitle="Warnings and errors are always sent. Choose what extra detail this device sends to the hub."
      wrapSubtitle
      icon="list"
      options={OPTIONS}
      value={chosen}
      onChange={(level) => {
        saveFlags(store, withShipLevel(selectSaved(store.get()), level));
      }}
    />
  );
}
