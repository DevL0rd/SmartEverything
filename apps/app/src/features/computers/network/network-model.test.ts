import { describe, expect, it } from 'vitest';
import type { InterfaceSnapshot } from '@smarteverything/domain';
import {
  adapterGroups,
  adapterLine,
  adapterState,
  addressLabel,
  bluetoothDeviceLine,
  bluetoothLine,
  bluetoothOrder,
  dbmOfPercent,
  isOnlyWifiLink,
  knownNetworks,
  showsTraffic,
  wifiLine,
} from './network-model';

function adapter(
  name: string,
  kind: InterfaceSnapshot['kind'],
  state: InterfaceSnapshot['state'],
): InterfaceSnapshot {
  return {
    name,
    kind,
    state,
    speedMbps: null,
    signalPercent: null,
    addresses: [],
    downloadRate: 0,
    uploadRate: 0,
  };
}

describe('network model', () => {
  it('maps a signal percent to the dBm the signal bars read', () => {
    expect(dbmOfPercent(100)).toBe(-50);
    expect(dbmOfPercent(0)).toBe(-100);
    expect(dbmOfPercent(null)).toBeNull();
  });

  it('words an adapter state', () => {
    expect(adapterState('up')).toEqual({ word: 'Connected', tone: 'positive' });
    expect(adapterState('down').word).toBe('Not connected');
  });

  it('draws traffic only for a connected adapter that is not a VPN', () => {
    expect(showsTraffic(adapter('eth0', 'ethernet', 'up'))).toBe(true);
    expect(showsTraffic(adapter('eth0', 'ethernet', 'down'))).toBe(false);
    expect(showsTraffic(adapter('wg0', 'vpn', 'up'))).toBe(false);
  });

  it('draws traffic only for a connected adapter that is not a VPN or a bridge', () => {
    expect(showsTraffic(adapter('virbr0', 'bridge', 'up'))).toBe(false);
  });

  it('splits connected from idle adapters, orders them by kind and gives each a plain title', () => {
    const groups = adapterGroups([
      adapter('tailscale0', 'vpn', 'up'),
      adapter('virbr0', 'bridge', 'up'),
      adapter('wlan0', 'wifi', 'up'),
      adapter('enp1s0', 'ethernet', 'down'),
      adapter('enp2s0', 'ethernet', 'down'),
      adapter('tun0', 'vpn', 'unknown'),
    ]);
    expect(groups.connected.map(({ name, title }) => [name, title])).toEqual([
      ['wlan0', 'Wi-Fi'],
      ['virbr0', 'Virtual bridge'],
      ['tailscale0', 'VPN 1'],
    ]);
    expect(groups.idle.map(({ name, title }) => [name, title])).toEqual([
      ['enp1s0', 'Ethernet 1'],
      ['enp2s0', 'Ethernet 2'],
      ['tun0', 'VPN 2'],
    ]);
  });

  it('puts the interface name in the line under the title', () => {
    expect(adapterLine({ name: 'wlan0', speedMbps: 866 })).toBe('wlan0 · 866 Mb/s');
    expect(adapterLine({ name: 'enp1s0', speedMbps: null })).toBe('enp1s0');
  });

  it('labels address families', () => {
    expect(addressLabel('192.168.1.4')).toBe('IPv4');
    expect(addressLabel('fe80::1')).toBe('IPv6');
  });

  it('knows when Wi-Fi is the only way in', () => {
    expect(isOnlyWifiLink([adapter('wlan0', 'wifi', 'up')])).toBe(true);
    expect(
      isOnlyWifiLink([adapter('wlan0', 'wifi', 'up'), adapter('eth0', 'ethernet', 'up')]),
    ).toBe(false);
    expect(isOnlyWifiLink([adapter('wlan0', 'wifi', 'up'), adapter('wg0', 'vpn', 'up')])).toBe(
      true,
    );
    expect(isOnlyWifiLink([adapter('eth0', 'ethernet', 'up')])).toBe(false);
  });

  it('words the Wi-Fi line and lists saved networks with the current one first', () => {
    const networks = [
      { ssid: 'B', signalPercent: 50, secured: true, known: true, connected: false },
      { ssid: 'A', signalPercent: 60, secured: true, known: true, connected: true },
      { ssid: 'Cafe', signalPercent: 30, secured: false, known: false, connected: false },
    ];
    expect(wifiLine(false, networks)).toBe('Off');
    expect(wifiLine(true, networks)).toBe('Connected to A');
    expect(wifiLine(true, [])).toBe('Not connected');
    expect(knownNetworks(networks).map((network) => network.ssid)).toEqual(['A', 'B']);
  });

  it('words Bluetooth and puts connected devices first', () => {
    const mouse = { id: 'b', name: 'Mouse', connected: false, batteryPercent: null };
    const buds = { id: 'a', name: 'Buds', connected: true, batteryPercent: 80 };
    const devices = [mouse, buds];
    expect(bluetoothLine(false, devices)).toBe('Off');
    expect(bluetoothLine(true, devices)).toBe('1 connected');
    expect(bluetoothLine(true, [])).toBe('On');
    expect(bluetoothOrder(devices).map((device) => device.name)).toEqual(['Buds', 'Mouse']);
    expect(bluetoothDeviceLine(buds)).toBe('Connected · 80 % battery');
  });
});
