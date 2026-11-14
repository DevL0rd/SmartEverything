import type { ReactNode } from 'react';
import { SelectRow } from '../../../components/rows';
import { soundOptions } from '../../planner/settings/options';

export interface SoundPickerProps {
  readonly sound: string;
  readonly compact: boolean;
  readonly disabled: boolean;
  readonly onChange: (sound: string) => void;
}

export function SoundPicker({ sound, compact, disabled, onChange }: SoundPickerProps): ReactNode {
  return (
    <SelectRow
      title="Sound"
      icon="bell"
      compact={compact}
      options={soundOptions(sound)}
      value={sound}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
