import { slotLabel, type PrinterSettingsPatch } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { List } from '../../../components/section';
import { usePrinterLive, type SupplyLive } from '../../../features/device-visuals';
import { Anchored } from './anchored';
import { StepperRow } from './rows';
import type { SettingsProps } from './settings-props';

type Write = (patch: PrinterSettingsPatch) => void;

function nameOf(supply: SupplyLive): string {
  return supply.detail.name === '' ? slotLabel(supply.detail.slot) : supply.detail.name;
}

function Thresholds({
  supplies,
  settings,
  write,
  device,
}: Pick<SettingsProps, 'settings' | 'device'> & {
  readonly supplies: readonly SupplyLive[];
  readonly write: Write;
}): ReactNode {
  return (
    <List title="Low levels" footer="A supply counts as low at or below this level.">
      <Anchored deviceId={device.id} id="low-levels" label="Low ink levels">
        {supplies.map((supply) => (
          <StepperRow
            key={supply.detail.key}
            title={nameOf(supply)}
            value={settings.lowThresholds[supply.detail.key] ?? supply.detail.threshold}
            range={{ min: 1, max: 50, step: 1 }}
            unit="%"
            onChange={(threshold) => {
              write({
                lowThresholds: { ...settings.lowThresholds, [supply.detail.key]: threshold },
              });
            }}
          />
        ))}
      </Anchored>
    </List>
  );
}

function Price({
  supply,
  settings,
  write,
}: Pick<SettingsProps, 'settings'> & {
  readonly supply: SupplyLive;
  readonly write: Write;
}): ReactNode {
  const { key } = supply.detail;
  const current = settings.prices[key] ?? { price: 0, yieldPages: 500 };
  const put = (next: typeof current): void => {
    write({ prices: { ...settings.prices, [key]: next } });
  };
  return (
    <>
      <StepperRow
        title={`${nameOf(supply)} price`}
        value={current.price}
        range={{ min: 0, max: 1000, step: 1 }}
        unit={settings.currency}
        onChange={(price) => {
          put({ ...current, price });
        }}
      />
      <StepperRow
        title={`${nameOf(supply)} yield`}
        value={current.yieldPages}
        range={{ min: 1, max: 100_000, step: 50 }}
        unit="pages"
        onChange={(yieldPages) => {
          put({ ...current, yieldPages });
        }}
      />
    </>
  );
}

export function SuppliesList({ device, settings, actor, owner }: SettingsProps): ReactNode {
  const live = usePrinterLive(device);
  if (!owner || live === null || live.supplies.length === 0) return null;
  const write: Write = (patch) => {
    actor.fire(
      { action: 'configure', printer: device.external_id, settings: patch },
      'The setting could not be saved',
    );
  };
  return (
    <>
      <Thresholds supplies={live.supplies} settings={settings} write={write} device={device} />
      <List
        title="Prices"
        footer={`Price of one cartridge in ${settings.currency} and the pages it prints.`}
      >
        <Anchored deviceId={device.id} id="prices" label="Cartridge prices and yields">
          {live.supplies
            .filter((supply) => supply.detail.consumed)
            .map((supply) => (
              <Price key={supply.detail.key} supply={supply} settings={settings} write={write} />
            ))}
        </Anchored>
      </List>
    </>
  );
}
