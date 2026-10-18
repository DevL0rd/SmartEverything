import type { PhoneDetail } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  activeBars,
  bluetoothIcon,
  bluetoothName,
  connectionTitle,
  dataRows,
  linkText,
  pushTrail,
  signalTone,
  signalWord,
  type NetworkSection,
} from './network-model';

function network(overrides: Partial<NetworkSection> = {}): NetworkSection {
  return {
    kind: 'wifi',
    wifi: { ssid: 'Home', rssiDbm: -52, bars: 4, linkMbps: 866, bandGhz: 5 },
    cellular: { bars: 2, generation: '5g', operator: 'Telstra' },
    vpn: false,
    metered: false,
    airplane: false,
    data: {
      today: { wifiBytes: 1_000_000, mobileBytes: 500_000 },
      month: { wifiBytes: 9_000_000, mobileBytes: 3_000_000 },
    },
    at: '2026-10-18T10:00:00.000Z',
    ...overrides,
  };
}

describe('signal quality', () => {
  it('turns bars into a word and a tone', () => {
    expect(signalWord(0)).toBe('No signal');
    expect(signalWord(4)).toBe('Excellent');
    expect(signalWord(9)).toBe('Excellent');
    expect(signalTone(4)).toBe('positive');
    expect(signalTone(3)).toBe('positive');
    expect(signalTone(2)).toBe('warning');
    expect(signalTone(1)).toBe('critical');
    expect(signalTone(0)).toBe('faint');
  });

  it('reads the bars of the connection that is in use', () => {
    expect(activeBars(network())).toBe(4);
    expect(activeBars(network({ kind: 'cellular' }))).toBe(2);
    expect(activeBars(network({ kind: 'offline' }))).toBe(0);
    expect(activeBars(network({ wifi: null }))).toBe(0);
  });
});

describe('the connection title and link', () => {
  it('shows the Wi-Fi name only to the people who may see it', () => {
    expect(connectionTitle(network(), true)).toBe('Home');
    expect(connectionTitle(network(), false)).toBe('Wi-Fi');
    expect(
      connectionTitle(
        network({ wifi: { ssid: null, rssiDbm: -60, bars: 3, linkMbps: 1, bandGhz: 2.4 } }),
        true,
      ),
    ).toBe('Wi-Fi');
  });

  it('names the other connection kinds', () => {
    expect(connectionTitle(network({ kind: 'cellular' }), true)).toBe('Telstra');
    expect(connectionTitle(network({ kind: 'cellular', cellular: null }), true)).toBe(
      'Mobile data',
    );
    expect(connectionTitle(network({ kind: 'ethernet' }), true)).toBe('Ethernet');
    expect(connectionTitle(network({ kind: 'offline' }), true)).toBe('Offline');
    expect(connectionTitle(network({ kind: 'other' }), true)).toBe('Connected');
  });

  it('adds the signal level only while someone is looking', () => {
    const wifi = network().wifi;
    if (wifi === null) throw new Error('fixture has Wi-Fi');
    expect(linkText(wifi, false)).toBe('866 Mbps · 5 GHz');
    expect(linkText(wifi, true)).toBe('-52 dBm · 866 Mbps · 5 GHz');
    expect(linkText({ ...wifi, bandGhz: 0 }, false)).toBe('866 Mbps');
  });
});

describe('data use', () => {
  it('makes a row for today and for the month with the total and a spoken line', () => {
    const rows = dataRows(network().data);
    expect(rows.map((row) => row.key)).toEqual(['today', 'month']);
    expect(rows[0]?.wifi).toBe(1_000_000);
    expect(rows[0]?.spoken.startsWith('Today: Wi-Fi')).toBe(true);
  });

  it('has no rows when the phone shares no data use', () => {
    expect(dataRows(null)).toEqual([]);
  });
});

describe('connected Bluetooth devices', () => {
  type Device = NonNullable<PhoneDetail['connections']>['bluetooth'][number];
  const buds: Device = { name: 'Galaxy Buds3', kind: 'headset', batteryPercent: 64 };

  it('names a device and falls back to its kind when the name is hidden', () => {
    expect(bluetoothName(buds)).toBe('Galaxy Buds3');
    expect(bluetoothName({ ...buds, name: null })).toBe('Headset');
    expect(bluetoothName({ name: '', kind: 'car', batteryPercent: null })).toBe('Car');
  });

  it('picks an icon per kind', () => {
    expect(bluetoothIcon('watch')).toBe('watch');
    expect(bluetoothIcon('computer')).toBe('laptop');
  });
});

describe('the signal trail', () => {
  it('keeps only the points inside the window and ignores a reading that is not newer', () => {
    const first = pushTrail([], { t: 1000, v: -50 }, 120_000);
    const second = pushTrail(first, { t: 61_000, v: -55 }, 120_000);
    const third = pushTrail(second, { t: 130_000, v: -60 }, 120_000);
    expect(third.map((point) => point.t)).toEqual([61_000, 130_000]);
    expect(pushTrail(third, { t: 130_000, v: -1 }, 120_000)).toBe(third);
    expect(pushTrail(third, { t: 5, v: -1 }, 120_000)).toBe(third);
  });
});
