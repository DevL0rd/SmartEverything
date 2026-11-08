import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceCapability } from '@smarteverything/domain';
import type { SelectProps } from '../../../components/select';
import type { StatTileProps } from '../../../components/stat-tile';
import type { Device } from '../../../store/state';
import { deviceModelOf } from '../model/device-model';
import { historyMetrics } from '../model/history-model';
import { HistorySection } from './history-section';
import { TrendTile } from './reading-tile';

let params: Readonly<Record<string, string>> = {};
const route = vi.hoisted(() => ({
  link: vi.fn(),
  series: vi.fn(() => ({ isPending: true })),
  metric: vi.fn<(props: SelectProps<string>) => void>(),
  setParams: vi.fn(),
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: (): typeof params => params,
  useRouter: (): { readonly setParams: typeof route.setParams } => ({
    setParams: route.setParams,
  }),
}));
vi.mock('react-native', () => ({ View: 'div' }));
vi.mock('../../../components/card', () => ({ Card: 'section' }));
vi.mock('../../../components/charts', () => ({}));
vi.mock('../../../components/empty-state', () => ({ EmptyState: (): null => null }));
vi.mock('../../../components/error-state', () => ({ ErrorState: (): null => null }));
vi.mock('../../../components/rows', () => ({ SwitchRow: (): null => null }));
vi.mock('../../../components/section', () => ({ List: 'section' }));
vi.mock('../../../components/segmented', () => ({ Segmented: (): null => null }));
vi.mock('../../../components/select', () => ({
  Select: (props: SelectProps<string>): null => {
    route.metric(props);
    return null;
  },
}));
vi.mock('../../../components/skeleton', () => ({ Skeleton: (): null => null }));
vi.mock('../../../components/stat-tile', () => ({
  StatTile: ({ href }: StatTileProps): null => {
    route.link(href);
    return null;
  },
}));
vi.mock('../../../queries/history', () => ({
  useDeviceSeries: route.series,
}));
vi.mock('./device-hero', () => ({
  splitUnit: (value: string): { readonly value: string } => ({ value }),
}));

function reading(key: DeviceCapability['key']): DeviceCapability {
  return { key, label: key, access: 'read', value: { kind: 'number', min: 0, max: 100, step: 1 } };
}

const DEVICE: Device = {
  id: 'd1',
  provider: 'local',
  external_id: 'd1',
  parent_id: null,
  kind: 'sensor',
  name: 'Sensor',
  display_name: null,
  model: 'generic',
  manufacturer: 'test',
  provider_room: null,
  room_id: null,
  online: true,
  capabilities: [reading('temperature'), reading('humidity')],
  details: {},
  hidden: false,
  favourite: false,
  position: 0,
  created_at: '2026-10-16T00:00:00Z',
  updated_at: '2026-10-16T00:00:00Z',
  label: 'Sensor',
};

describe('reading history navigation', () => {
  beforeEach(() => {
    params = {};
    vi.clearAllMocks();
  });

  it('links a reading tile to the history of that capability', () => {
    const temperature = historyMetrics(deviceModelOf(DEVICE).presentation, false).find(
      ({ key }) => key === 'temperature',
    );
    if (temperature === undefined) throw new Error('The fixture has no temperature metric');
    renderToStaticMarkup(
      createElement(TrendTile, { device: DEVICE, presented: temperature, value: 24 }),
    );
    expect(route.link).toHaveBeenCalledExactlyOnceWith({
      pathname: '/device/[deviceId]/[section]',
      params: { deviceId: 'd1', section: 'history', metric: 'temperature' },
    });
  });

  it('charts the metric in the link and defaults to the first reading for an unknown metric', () => {
    params = { metric: 'temperature' };
    renderToStaticMarkup(createElement(HistorySection, { device: DEVICE }));
    expect(route.series).toHaveBeenCalledExactlyOnceWith('d1', 'temperature', 24);

    params = { metric: 'unavailable' };
    renderToStaticMarkup(createElement(HistorySection, { device: DEVICE }));
    expect(route.series).toHaveBeenLastCalledWith('d1', 'humidity', 24);
  });

  it('writes a metric picked in the toolbar back to the History route', () => {
    params = { metric: 'temperature' };
    renderToStaticMarkup(createElement(HistorySection, { device: DEVICE }));

    const picker = route.metric.mock.lastCall?.[0];
    if (picker === undefined) throw new Error('The History metric selector did not render');
    expect(picker.value).toBe('temperature');
    expect(picker.options.map(({ value }) => value)).toEqual(['humidity', 'temperature']);
    picker.onChange('humidity');
    expect(route.setParams).toHaveBeenCalledExactlyOnceWith({ metric: 'humidity' });
  });
});
