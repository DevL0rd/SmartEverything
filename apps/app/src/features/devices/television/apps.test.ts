import { describe, expect, it } from 'vitest';
import { deviceFixture } from '../../../store/device-fixture';
import type { Device } from '../../../store/state';
import {
  CARD_APP_COUNT,
  featuredApps,
  launchableApps,
  recentLaunches,
  type LaunchRecord,
} from './apps';

function tv(options: readonly string[]): Device {
  return deviceFixture(0, {
    kind: 'television',
    capabilities: [
      {
        key: 'app_launch',
        label: 'Open app',
        access: 'write',
        value: { kind: 'enum', options: [...options] },
      },
    ],
  });
}

describe('television apps', () => {
  it('lists only the apps this TV can open, with a tone and monogram', () => {
    const apps = launchableApps(tv(['Netflix', 'YouTube', 'Not an app']));
    expect(apps.map((app) => app.name).sort()).toEqual(['Netflix', 'YouTube']);
    expect(apps.every((app) => app.monogram.length > 0)).toBe(true);
  });

  it('lists nothing when the TV cannot open apps', () => {
    expect(launchableApps(deviceFixture(0, { kind: 'television', capabilities: [] }))).toEqual([]);
  });

  it('puts the app that is playing first, then the featured ones', () => {
    const all = launchableApps(tv(['YouTube', 'Netflix', 'Prime Video', 'Plex', 'Spotify', 'Max']));
    const shown = featuredApps(all, 'Plex', [], CARD_APP_COUNT);
    expect(shown.map((app) => app.name)).toEqual(['Plex', 'YouTube', 'Netflix', 'Prime Video']);
  });

  it('shows no more apps than the card has room for and never repeats one', () => {
    const all = launchableApps(tv(['YouTube', 'Netflix', 'Prime Video', 'Plex', 'Spotify']));
    const shown = featuredApps(all, 'YouTube', [], CARD_APP_COUNT);
    expect(shown).toHaveLength(CARD_APP_COUNT);
    expect(new Set(shown.map((app) => app.name)).size).toBe(CARD_APP_COUNT);
  });

  it('puts recently opened apps after the playing one and before the featured list', () => {
    const all = launchableApps(tv(['YouTube', 'Netflix', 'Prime Video', 'Plex', 'Max']));
    const shown = featuredApps(all, 'Plex', ['Max', 'Netflix'], CARD_APP_COUNT);
    expect(shown.map((app) => app.name)).toEqual(['Plex', 'Max', 'Netflix', 'YouTube']);
  });

  it('reads the newest distinct launches of this TV only, skipping failed ones', () => {
    const row = (
      device: string | null,
      value: string,
      status: LaunchRecord['status'],
      at: string,
    ): LaunchRecord => ({
      device_id: device,
      capability: 'app_launch',
      value,
      status,
      created_at: at,
    });
    const recent = recentLaunches(
      [
        row('a', 'Netflix', 'succeeded', '2026-10-18T10:00:00.000Z'),
        row('a', 'Plex', 'succeeded', '2026-10-18T11:00:00.000Z'),
        row('a', 'Netflix', 'succeeded', '2026-10-18T12:00:00.000Z'),
        row('a', 'Max', 'failed', '2026-10-18T13:00:00.000Z'),
        row('b', 'YouTube', 'succeeded', '2026-10-18T14:00:00.000Z'),
      ],
      'a',
    );
    expect(recent).toEqual(['Netflix', 'Plex']);
  });
});
