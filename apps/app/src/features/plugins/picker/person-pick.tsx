import type { ReactNode } from 'react';
import { useState } from 'react';
import type { PluginOption, PluginRow } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { OptionPickerSheet } from './option-picker-sheet';
import { OptionVisual } from './option-visual';

export function PersonPick({
  row,
  source,
  picked,
  onPick,
}: {
  readonly row: PluginRow;
  readonly source: string;
  readonly picked: PluginOption | null;
  readonly onPick: (option: PluginOption) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        title={picked === null ? `Choose from ${row.manifest.name}` : picked.label}
        {...(picked?.detail === null || picked === null ? {} : { subtitle: picked.detail })}
        {...(picked === null
          ? { icon: 'users' as const }
          : { leading: <OptionVisual option={picked} /> })}
        chevron
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <OptionPickerSheet
          row={row}
          source={source}
          title="Choose a person"
          noun="people"
          chosen={picked === null ? [] : [picked.id]}
          multiple={false}
          onPick={(option) => {
            onPick(option);
            setOpen(false);
          }}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
