import { describe, expect, it } from 'vitest';
import {
  isShellyDynamic,
  isShellyVirtual,
  shellyCertificateTargets,
  shellyComponentCapability,
  shellyExternalId,
  shellyZoneDelays,
  shellyZoneExternalId,
  shellyZoneWrite,
} from '../src';

describe('component sets', () => {
  it('knows virtual and BTHome components', () => {
    expect(['boolean', 'group', 'bthomesensor', 'wifi'].map(isShellyVirtual)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(['boolean', 'group', 'bthomesensor', 'wifi'].map(isShellyDynamic)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });
});

describe('certificate targets', () => {
  it('lists the targets whose method the sensor reports, ignoring case', () => {
    expect(
      shellyCertificateTargets(['shelly.putuserca', 'Shelly.PutTLSClientKey', 'Sys.GetStatus']),
    ).toEqual(['user_ca', 'tls_client_key']);
  });

  it('lists nothing for a sensor without certificate methods', () => {
    expect(shellyCertificateTargets([])).toEqual([]);
  });
});

describe('zone delay aliases', () => {
  it('shows the renamed thresholds as delays', () => {
    expect(shellyZoneDelays({ presence_thr: 5, absence_thr: null })).toEqual({
      presence_thr: 5,
      absence_thr: null,
      presence_delay: 5,
      absence_delay: null,
    });
  });

  it('keeps zones without renamed thresholds as they are', () => {
    expect(shellyZoneDelays({ presence_delay: 2 })).toEqual({ presence_delay: 2 });
  });

  it('writes delays under the key the zone already uses', () => {
    expect(shellyZoneWrite({ presence_thr: 1 }, { presence_delay: 4, absence_delay: 6 })).toEqual({
      presence_thr: 4,
      absence_delay: 6,
    });
    expect(shellyZoneWrite({ absence_thr: 1 }, { absence_delay: 3 })).toEqual({ absence_thr: 3 });
  });

  it('passes other settings through untouched', () => {
    expect(shellyZoneWrite({}, { presence_delay: 1 })).toEqual({ presence_delay: 1 });
    expect(shellyZoneWrite({}, {})).toEqual({});
  });
});

describe('external ids', () => {
  it('names sensors, zones and component capabilities', () => {
    expect(shellyExternalId('abc')).toBe('shelly-presence:abc');
    expect(shellyZoneExternalId('abc', 2, 0)).toBe('shelly-presence:abc:presencezone:2');
    expect(shellyZoneExternalId('abc', 2, 3)).toBe(
      'shelly-presence:abc:presencezone:2:generation:3',
    );
    expect(shellyComponentCapability('wifi')).toBe('raw:shelly.component.wifi');
  });
});
