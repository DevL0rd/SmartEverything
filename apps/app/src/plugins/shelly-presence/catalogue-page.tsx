import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  SHELLY_ACTIONS,
  type ShellyAction,
  type ShellyDevice,
  type ShellyPage,
} from '@smarteverything/shelly';
import { EmptyState } from '../../components/empty-state';
import { ActionList, listedActions } from './action-list';
import { ActionRunner, useActionDraft } from './action-runner';
import { ComponentInstances, managedInstance } from './component-instances';
import { DiagnosticsExtras } from './diagnostics-extras';
import type { JsonRecord } from './form-model';
import { FirmwareUpload } from './firmware-upload';
import { actionAvailable } from './presence-operation';
import { resourceForPage, ResourcePage } from './resource-pages';
import { SettingsCard } from './settings-card';
import { rowsFor, settingCards } from './settings-model';
import { useCanOperate } from './use-can-operate';
import { usePresenceSelection } from './use-presence-selection';

const INITIAL_PARAMS: Readonly<Partial<Record<ShellyAction, () => JsonRecord>>> = {
  device_set_time: () => ({ unixtime: Math.floor(Date.now() / 1000) }),
};

function ActionPanel({
  sensor,
  action,
  close,
}: {
  readonly sensor: ShellyDevice;
  readonly action: ShellyAction;
  readonly close: () => void;
}): ReactNode {
  const draft = useActionDraft(INITIAL_PARAMS[action]?.() ?? {});
  return <ActionRunner sensor={sensor} action={action} draft={draft} close={close} />;
}

function extrasOf(sensor: ShellyDevice, page: ShellyPage): ReactNode {
  const resource = resourceForPage(page);
  if (resource !== null) return <ResourcePage sensor={sensor} resource={resource} />;
  if (page === 'presence-components') return <ComponentInstances sensor={sensor} />;
  if (page === 'presence-diagnostics') return <DiagnosticsExtras sensor={sensor} />;
  return page === 'presence-device' ? <FirmwareUpload sensor={sensor} /> : null;
}

export function CataloguePage({
  sensor,
  page,
}: {
  readonly sensor: ShellyDevice;
  readonly page: ShellyPage;
}): ReactNode {
  const params = useLocalSearchParams<{ readonly focus?: string }>();
  const [selected, select] = usePresenceSelection('action');
  const canOperate = useCanOperate();
  const chosen = SHELLY_ACTIONS.find(
    (action) => action === selected && actionAvailable(sensor, action) && canOperate(action),
  );
  if (chosen !== undefined)
    return (
      <ActionPanel
        key={chosen}
        sensor={sensor}
        action={chosen}
        close={() => {
          select(null);
        }}
      />
    );
  const rows = rowsFor(sensor, page).filter((row) => !managedInstance(row.component));
  const cards = settingCards(sensor, rows);
  const actions = listedActions(sensor, page).filter(canOperate);
  const extras = extrasOf(sensor, page);
  const empty = extras === null && cards.length === 0 && actions.length === 0;
  return (
    <View className="gap-section-gap">
      {extras}
      {cards.map((card) => (
        <SettingsCard key={card.key} sensor={sensor} card={card} focus={params.focus} />
      ))}
      <ActionList actions={actions} choose={select} />
      {empty ? (
        <EmptyState
          icon="settings"
          title="Nothing to configure here"
          body="Only what this sensor advertises appears on its pages."
        />
      ) : null}
    </View>
  );
}
