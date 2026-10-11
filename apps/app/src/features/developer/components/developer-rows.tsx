import type { ReactNode } from 'react';
import { ActionRow, SwitchRow } from '../../../components/rows';
import { reloadPending, setDeveloperToggle } from '../../../developer/boot';
import { toggleOf, type DeveloperFlagId } from '../../../developer/toggles';
import { reloadApp } from '../../../platform/reload';
import { useLocalPref } from '../../../store/local-prefs';

export function DeveloperToggleRow({ id }: { readonly id: DeveloperFlagId }): ReactNode {
  const stored = useLocalPref('developerFlags');
  const toggle = toggleOf(id);
  const parentOff = toggle.parent !== null && stored[toggle.parent] !== true;
  const note = toggle.reload ? ' Needs a reload.' : '';
  return (
    <SwitchRow
      title={toggle.label}
      subtitle={`${toggle.description} Cost: ${toggle.cost}${note}`}
      wrapSubtitle
      icon={toggle.section === 'Logging' ? 'list' : 'gauge'}
      value={stored[id] === true && !parentOff}
      disabled={parentOff}
      onChange={(value) => {
        setDeveloperToggle(id, value);
      }}
    />
  );
}

export function ReloadRow(): ReactNode {
  const stored = useLocalPref('developerFlags');
  const pending = reloadPending(stored);
  return (
    <ActionRow
      title="Reload app"
      subtitle={pending ? 'Changes are waiting for a reload.' : 'No changes are waiting.'}
      wrapSubtitle
      icon="refresh"
      onPress={reloadApp}
    />
  );
}
