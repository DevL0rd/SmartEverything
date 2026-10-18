import { describe, expect, it } from 'vitest';
import { managedInstance } from './component-instances';
import { presenceFixture } from './presence-fixture';
import { groupTitle, instancesOf, rowsFor, settingCards } from './settings-model';

const sensor = presenceFixture({
  components: [
    { key: 'wifi', component: 'wifi', config: { sta: { ssid: 'home' }, ap: { enable: false } } },
    { key: 'number:200', component: 'number', config: { name: 'Fan' } },
  ],
});

describe('settings pages from the catalogue', () => {
  it('lists only the rows the sensor advertises for a page', () => {
    expect(rowsFor(sensor, 'presence-detection').map((row) => row.id)).toStrictEqual([
      'presence.enable',
      'presence.sensor.height',
    ]);
    expect(rowsFor(sensor, 'presence-network').map((row) => row.id)).toStrictEqual([
      'wifi.sta.ssid',
      'wifi.ap.enable',
    ]);
  });

  it('builds one card per component instance with a section per group', () => {
    const cards = settingCards(sensor, rowsFor(sensor, 'presence-network'));
    expect(cards).toHaveLength(1);
    expect(cards[0]?.component).toBe('wifi');
    expect(cards[0]?.sections.map((section) => section.title)).toStrictEqual([
      'Primary Wi-Fi',
      'Access point',
    ]);
  });

  it('finds instances with their ids and display names', () => {
    expect(instancesOf(sensor, 'number')).toStrictEqual([
      { key: 'number:200', title: 'Fan', id: 200, config: { name: 'Fan' }, status: null },
    ]);
    expect(instancesOf(sensor, 'presence')).toHaveLength(1);
    expect(instancesOf(sensor, 'illuminance')).toStrictEqual([]);
  });

  it('keeps virtual and Bluetooth instances out of the flat settings cards', () => {
    expect(managedInstance('number')).toBe(true);
    expect(managedInstance('bthomesensor')).toBe(true);
    expect(managedInstance('bthome')).toBe(false);
    expect(managedInstance('wifi')).toBe(false);
  });

  it('titles groups readably', () => {
    expect(groupTitle('height-limits')).toBe('Height limits');
    expect(groupTitle('sta1')).toBe('Fallback Wi-Fi');
  });
});
