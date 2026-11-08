import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Checkbox } from '../../../components/checkbox';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { ActionRow, SelectRow, SwitchRow } from '../../../components/rows';
import { saveFlags, savedFlags, toggleFlag, unlockedFlags } from '../../../developer/boot';
import { setDeveloperLevel } from '../../../developer/panel';
import { useDeveloperInherited, useDeveloperOn } from '../../../developer/panel-read';
import {
  PROFILING_IDS,
  profilingOnCount,
  profilingState,
  withAllProfiling,
} from '../../../developer/profiling-master';
import {
  LEVEL_TEXT,
  LOG_LEVEL_CHOICES,
  storedLogLevel,
  toggleOf,
  withLogLevel,
  type DeveloperFlagId,
  type LogLevelChoice,
  type StoredFlags,
} from '../../../developer/toggles';
import { restartApp } from '../../../platform/reload';
import { shallowEqual, useEntityStore, useStoreSelector } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';

const selectSaved = (state: StoreState): StoredFlags => savedFlags(state.tables.layouts);

const selectLevel = (state: StoreState): LogLevelChoice => storedLogLevel(selectSaved(state));

export function DeveloperModeRow(): ReactNode {
  const store = useEntityStore();
  const on = useDeveloperOn();
  const inherited = useDeveloperInherited();
  return (
    <SwitchRow
      title="Developer mode"
      subtitle={
        inherited
          ? 'Enabled by your profile. Warnings and errors still go to the hub.'
          : 'Shows diagnostic tools. Warnings and errors still go to the hub.'
      }
      wrapSubtitle
      icon="wrench"
      value={on}
      disabled={inherited}
      onChange={(value) => {
        setDeveloperLevel(store, value ? 'on' : 'off');
      }}
    />
  );
}

export function WatchCaptureToggleRow(): ReactNode {
  const store = useEntityStore();
  const toggle = toggleOf('watch.capture');
  const enabled = useStoreSelector((state) => unlockedFlags(state)[toggle.id]);
  return (
    <SwitchRow
      title={toggle.label}
      subtitle={`${toggle.description} ${toggle.cost}`}
      wrapSubtitle
      icon="watch"
      value={enabled}
      onChange={(value) => {
        toggleFlag(store, toggle.id, value);
      }}
    />
  );
}

export function ProfilingOption({ id }: { readonly id: DeveloperFlagId }): ReactNode {
  const store = useEntityStore();
  const toggle = toggleOf(id);
  const [checked, disabled] = useStoreSelector((state) => {
    const flags = unlockedFlags(state);
    return [flags[id], toggle.parent !== null && !flags[toggle.parent]] as const;
  }, shallowEqual);
  return (
    <Checkbox
      label={toggle.label}
      description={toggle.description}
      caption={`Cost · ${toggle.cost}`}
      checked={checked}
      disabled={disabled}
      className={cn('px-4 py-2.5', toggle.parent !== null && 'pl-7')}
      onChange={(value) => {
        toggleFlag(store, id, value);
      }}
    />
  );
}

const LOG_OPTIONS = LOG_LEVEL_CHOICES.map((level) => ({
  value: level,
  label: { info: 'Info', debug: 'Debug', trace: 'Trace' }[level],
  description: LEVEL_TEXT[level],
  wrapDescription: true,
}));

export function LogLevelRow(): ReactNode {
  const store = useEntityStore();
  const chosen = useStoreSelector(selectLevel);
  return (
    <SelectRow
      title="Device log detail"
      subtitle="Sets the detail collected on this device. Hub uploads may collect more if requested."
      wrapSubtitle
      icon="list"
      options={LOG_OPTIONS}
      value={chosen}
      onChange={(level) => {
        saveFlags(store, withLogLevel(selectSaved(store.get()), level));
      }}
    />
  );
}

export function ProfilingHeader(): ReactNode {
  const store = useEntityStore();
  const developer = useDeveloperOn();
  const saved = useStoreSelector(selectSaved);
  const state = profilingState(saved, developer);
  const count = profilingOnCount(saved, developer);
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-x-3 px-4 py-2">
      <View className="min-w-0 shrink">
        <Text variant="title-3" accessibilityRole="header">
          Profiling
        </Text>
        <Text variant="footnote" tone="variant" aria-live="polite">
          {count} of {PROFILING_IDS.length} on
        </Text>
      </View>
      <Checkbox
        label="Select all"
        checked={state === 'mixed' ? 'mixed' : state === 'on'}
        className="-mr-2 max-w-full px-2"
        onChange={(enabled) => {
          saveFlags(store, withAllProfiling(selectSaved(store.get()), enabled));
        }}
      />
    </View>
  );
}

export function ReloadRow(): ReactNode {
  return (
    <ActionRow
      title="Reload app"
      subtitle="Restarts the app on this device."
      wrapSubtitle
      icon="refresh"
      onPress={restartApp}
    />
  );
}
