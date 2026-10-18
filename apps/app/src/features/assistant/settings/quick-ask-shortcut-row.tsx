import type { ReactNode } from 'react';
import { SelectRow } from '../../../components/rows';
import { QUICK_ASK_SHORTCUTS, setLocalPref, useLocalPref } from '../../../store/local-prefs';
import { quickAskKeys } from './quick-ask-shortcut';

export function QuickAskShortcutRow(): ReactNode {
  const options = QUICK_ASK_SHORTCUTS.map((value) => ({ value, label: quickAskKeys(value) }));
  return (
    <SelectRow
      title="Quick Ask shortcut"
      subtitle="Opens Quick Ask from anywhere in the app."
      icon="keyboard"
      options={options}
      value={useLocalPref('quickAskShortcut')}
      onChange={(next) => {
        setLocalPref('quickAskShortcut', next);
      }}
    />
  );
}
