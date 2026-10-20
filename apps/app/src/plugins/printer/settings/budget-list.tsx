import type { PrinterSettingsPatch } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Anchored } from './anchored';
import { StepperRow } from './rows';
import type { SettingsProps } from './settings-props';

function useChange({ device, actor }: SettingsProps): (settings: PrinterSettingsPatch) => void {
  return (settings): void => {
    actor.fire(
      { action: 'configure', printer: device.external_id, settings },
      'The setting could not be saved',
    );
  };
}

export function UpdatesList(props: SettingsProps): ReactNode {
  const change = useChange(props);
  const { settings, device, owner } = props;
  if (!owner) return null;
  return (
    <List title="Updates" footer="How often the hub asks the printer how it is doing.">
      <Anchored deviceId={device.id} id="updates" label="How often to check the printer">
        <StepperRow
          title="When nothing is happening"
          value={settings.idleSeconds}
          range={{ min: 5, max: 600, step: 5 }}
          unit="s"
          onChange={(idleSeconds) => {
            change({ idleSeconds });
          }}
        />
        <StepperRow
          title="While printing or in view"
          value={settings.activeSeconds}
          range={{ min: 1, max: 60, step: 1 }}
          unit="s"
          onChange={(activeSeconds) => {
            change({ activeSeconds });
          }}
        />
        {settings.pushing ? (
          <StepperRow
            title="Push subscription renewal"
            value={settings.leaseSeconds}
            range={{ min: 60, max: 86_400, step: 60 }}
            unit="s"
            onChange={(leaseSeconds) => {
              change({ leaseSeconds });
            }}
          />
        ) : null}
      </Anchored>
    </List>
  );
}

export function GoalsList(props: SettingsProps): ReactNode {
  const change = useChange(props);
  const { settings, device, owner } = props;
  if (!owner) return null;
  return (
    <List title="Goals">
      <Anchored deviceId={device.id} id="goals" label="Print goals and budget">
        <StepperRow
          title="Weekly page budget"
          value={settings.weeklyBudget}
          range={{ min: 1, max: 100_000, step: 10 }}
          unit="pages"
          onChange={(weeklyBudget) => {
            change({ weeklyBudget });
          }}
        />
        <StepperRow
          title="Monthly spend cap"
          subtitle="Needs cartridge prices below"
          value={settings.monthlyCap}
          range={{ min: 0, max: 10_000, step: 5 }}
          unit={settings.currency}
          onChange={(monthlyCap) => {
            change({ monthlyCap });
          }}
        />
        <StepperRow
          title="Print less target"
          subtitle="Pages a week to stay under"
          value={settings.printLessTarget}
          range={{ min: 0, max: 100_000, step: 5 }}
          unit="pages"
          onChange={(printLessTarget) => {
            change({ printLessTarget });
          }}
        />
      </Anchored>
    </List>
  );
}

export function NotificationsList(props: SettingsProps): ReactNode {
  const change = useChange(props);
  const { settings, device, owner } = props;
  if (!owner) return null;
  const rows = [
    { key: 'low', title: 'A supply runs low', value: settings.notify.low },
    { key: 'empty', title: 'A supply is empty', value: settings.notify.empty },
    { key: 'problem', title: 'The printer has a problem', value: settings.notify.problem },
    { key: 'offline', title: 'Offline for more than 30 minutes', value: settings.notify.offline },
  ] as const;
  return (
    <List title="Notifications">
      <Anchored deviceId={device.id} id="notifications" label="Printer notifications">
        {rows.map((row) => (
          <SwitchRow
            key={row.key}
            icon="bell"
            title={row.title}
            value={row.value}
            onChange={(next) => {
              change({ notify: { [row.key]: next } });
            }}
          />
        ))}
      </Anchored>
    </List>
  );
}
