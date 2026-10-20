import type { ReactNode } from 'react';
import { ActionRow, SwitchRow } from '../../../components/rows';
import { reloadPending, setAllProfiling, setDeveloperToggle } from '../../../developer/boot';
import {
  PROFILING_IDS,
  profilingOnCount,
  profilingState,
} from '../../../developer/profiling-master';
import {
  resolveFlags,
  toggleOf,
  type DeveloperFlagId,
  type DeveloperToggle,
} from '../../../developer/toggles';
import type { IconName } from '../../../components/icon-glyphs';
import { reloadApp } from '../../../platform/reload';
import { useLocalPref } from '../../../store/local-prefs';

const SECTION_ICONS = {
  Performance: 'gauge',
  Logging: 'list',
  Watch: 'watch',
} as const satisfies Record<DeveloperToggle['section'], IconName>;

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
      icon={SECTION_ICONS[toggle.section]}
      value={resolveFlags(stored, __DEV__)[id]}
      disabled={parentOff}
      onChange={(value) => {
        setDeveloperToggle(id, value);
      }}
    />
  );
}

export function ProfilingMasterRow(): ReactNode {
  const stored = useLocalPref('developerFlags');
  const state = profilingState(stored, __DEV__);
  const count = `${String(profilingOnCount(stored, __DEV__))} of ${String(PROFILING_IDS.length)} on.`;
  return (
    <SwitchRow
      title="Enable all profiling"
      subtitle={`Turns every performance option below on or off. ${count} Options that need a reload start after Reload app.`}
      wrapSubtitle
      icon="gauge"
      value={state === 'on'}
      mixed={state === 'mixed'}
      onChange={() => {
        setAllProfiling(state !== 'on');
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
