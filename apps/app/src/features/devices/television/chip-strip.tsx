import type { ReactNode } from 'react';
import { DeviceScheduleChip } from '../../automations';
import { featuredApps, type TvApp } from './apps';
import { ChipRow } from './chips';
import { useRecentApps } from './use-recent-apps';
import type { TvSheets } from './sheet-state';
import type { Television } from './use-television';
import type { TelevisionActions } from './use-television-actions';

export function ChipStrip({
  tv,
  actions,
  sheets,
  apps,
  count,
}: {
  readonly tv: Television;
  readonly actions: TelevisionActions;
  readonly sheets: TvSheets;
  readonly apps: readonly TvApp[];
  readonly count: number;
}): ReactNode {
  const recent = useRecentApps(tv.device.id);
  const shown = featuredApps(apps, tv.view.app?.name ?? null, recent, count);
  return (
    <ChipRow
      tv={tv}
      apps={shown}
      lead={<DeviceScheduleChip deviceId={tv.device.id} compact />}
      onInputs={(): void => {
        sheets.open('inputs');
      }}
      onMore={
        apps.length > shown.length
          ? (): void => {
              sheets.open('apps');
            }
          : null
      }
      onOpen={actions.openApp}
    />
  );
}
