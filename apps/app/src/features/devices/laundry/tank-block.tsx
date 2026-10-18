import type { ReactNode } from 'react';
import { View } from 'react-native';
import { withRole } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { ProgressBar } from '../../../components/charts';
import { confirm } from '../../../components/confirm-store';
import { argumentsOf } from '../controls/run-action';
import { Block } from './block';
import { Pills } from './parts';
import { useRoleControl } from './use-role-control';
import type { Laundry } from './use-laundry';

const TANKS = [
  { value: 'Laundry Detergent', label: 'Detergent' },
  { value: 'Softener', label: 'Softener' },
] as const;

const DEFAULT_MINUTES = 50;

function totalMinutes(laundry: Laundry): number {
  const descriptor = withRole(laundry.presentation, 'tank_clean_minutes')?.capability.value;
  return descriptor?.kind === 'number' ? descriptor.max : DEFAULT_MINUTES;
}

function startValue(laundry: Laundry, slot: string): string | Record<string, string> | null {
  const presented = withRole(laundry.presentation, 'tank_clean_start');
  const names = presented === undefined ? [] : argumentsOf(presented);
  return names.length === 0 ? null : Object.fromEntries(names.map((name) => [name, slot]));
}

export function TankBlock({ laundry }: { readonly laundry: Laundry }): ReactNode {
  const slot = useRoleControl(laundry, 'tank_clean_slot');
  const start = useRoleControl(laundry, 'tank_clean_start');
  const stop = useRoleControl(laundry, 'tank_clean_stop');
  const left = laundry.snapshot.values.tank_clean_minutes;
  const rinsing = typeof left === 'number' && left > 0;
  const chosen = typeof slot.control.value === 'string' ? slot.control.value : TANKS[0].value;
  const name = chosen === 'Softener' ? 'softener' : 'detergent';
  const begin = async (): Promise<void> => {
    if (await confirm({ title: `Rinse the ${name} tank?`, confirmLabel: 'Start rinse' })) {
      await slot.control.set(chosen);
      await start.control.set(startValue(laundry, chosen));
    }
  };
  return (
    <Block
      icon="droplet"
      title={`Rinse the ${name} tank`}
      sub={rinsing ? `${String(left)} min left` : 'Flushes the auto-dose tank and pipe.'}
    >
      {rinsing ? (
        <ProgressBar
          progress={1 - left / totalMinutes(laundry)}
          colour="temp-cool"
          label="Tank rinse progress"
        />
      ) : (
        <Pills
          label="Tank"
          options={TANKS}
          value={chosen}
          disabled={!laundry.device.online}
          onChange={(value) => {
            background(slot.control.set(value), 'laundry.tank_failed');
          }}
        />
      )}
      <View className="flex-row">
        <Button
          label={rinsing ? 'Stop' : 'Start'}
          variant="tonal"
          disabled={!laundry.device.online}
          onPress={() => {
            background(rinsing ? stop.control.set(null) : begin(), 'laundry.tank_failed');
          }}
        />
      </View>
    </Block>
  );
}
