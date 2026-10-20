import type { ReactNode } from 'react';
import { useState } from 'react';
import { SwitchRow } from '../../../components/rows';
import { toggled } from '../model/scopes';
import { EditorSheet } from './editor-sheet';

export interface ChecklistOption {
  readonly value: string;
  readonly label: string;
}

export function ChecklistSheet({
  title,
  intro,
  options,
  selected,
  onSave,
  onClose,
}: {
  readonly title: string;
  readonly intro: string;
  readonly options: readonly ChecklistOption[];
  readonly selected: readonly string[];
  readonly onSave: (selected: string[]) => void;
  readonly onClose: () => void;
}): ReactNode {
  const [chosen, setChosen] = useState<readonly string[]>(selected);
  return (
    <EditorSheet
      title={title}
      intro={intro}
      onClose={onClose}
      onSave={() => {
        onSave(options.filter((one) => chosen.includes(one.value)).map((one) => one.value));
      }}
    >
      {options.map((option) => (
        <SwitchRow
          key={option.value}
          title={option.label}
          value={chosen.includes(option.value)}
          onChange={() => {
            setChosen((now) => toggled(now, option.value));
          }}
        />
      ))}
    </EditorSheet>
  );
}
