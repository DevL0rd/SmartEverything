import { describe, expect, it } from 'vitest';
import type { DiscoveredDevice } from '@smarteverything/domain';
import type { WizPilot } from '../../../src/plugins/builtin/wiz/protocol';
import { WizPublication, type WizSnapshot } from '../../../src/plugins/builtin/wiz/publication';
import { BULB_MAC, COLOUR_PILOT, recordDriver } from './fake-wiz';

function snapshot(change: Partial<WizPilot>, online = true): WizSnapshot {
  return {
    bulb: {
      mac: BULB_MAC,
      address: '192.168.1.20',
      config: { moduleName: 'ESP01_SHRGB_03' },
      pilot: { ...COLOUR_PILOT, ...change },
    },
    online,
    at: '2026-10-17T10:00:00.000Z',
  };
}

function gate(): { readonly open: () => void; readonly wait: Promise<void> } {
  let open = (): void => undefined;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, wait };
}

describe('WiZ publication', () => {
  it('skips the changes that were replaced while it was busy', async () => {
    const blocked = gate();
    const inventories: DiscoveredDevice[][] = [];
    const driver = recordDriver(new AbortController().signal, async (devices) => {
      inventories.push([...devices]);
      if (inventories.length === 1) await blocked.wait;
    });
    const publication = new WizPublication();
    publication.attach(driver.context);
    publication.update(snapshot({ dimming: 10 }));
    publication.update(snapshot({ dimming: 20 }));
    publication.update(snapshot({ dimming: 30 }));
    publication.update(snapshot({ dimming: 40 }));
    blocked.open();
    await publication.settled();
    const brightness = driver.states
      .filter((update) => update.capability === 'brightness')
      .map((update) => update.value);
    expect(brightness).toEqual([10, 40]);
    expect(inventories).toHaveLength(1);
  });

  it('sends a reading only when its value changed', async () => {
    const driver = recordDriver(new AbortController().signal);
    const publication = new WizPublication();
    publication.attach(driver.context);
    publication.update(snapshot({ rssi: -60 }));
    await publication.settled();
    const first = driver.states.length;
    publication.update(snapshot({ rssi: -75 }));
    await publication.settled();
    expect(driver.states).toHaveLength(first);
    publication.update(snapshot({ dimming: 90 }));
    await publication.settled();
    expect(driver.states.slice(first).map((update) => [update.capability, update.value])).toEqual([
      ['brightness', 90],
    ]);
  });

  it('marks the light offline without sending readings', async () => {
    const driver = recordDriver(new AbortController().signal);
    const publication = new WizPublication();
    publication.attach(driver.context);
    publication.update(snapshot({}));
    await publication.settled();
    const readings = driver.states.length;
    publication.update(snapshot({ dimming: 5 }, false));
    await publication.settled();
    expect(driver.published.at(-1)?.[0]?.online).toBe(false);
    expect(driver.states).toHaveLength(readings);
  });

  it('reports a failed inventory update and carries on with the next one', async () => {
    let calls = 0;
    const driver = recordDriver(new AbortController().signal, () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('store busy')) : Promise.resolve();
    });
    const publication = new WizPublication();
    publication.attach(driver.context);
    publication.update(snapshot({}));
    await publication.settled();
    expect(driver.failures.map((failure) => failure.operation)).toEqual(['publish_inventory']);
    publication.update(snapshot({ dimming: 70 }));
    await publication.settled();
    expect(driver.states.map((update) => update.capability)).toContain('brightness');
  });

  it('publishes nothing after it is detached', async () => {
    const driver = recordDriver(new AbortController().signal);
    const publication = new WizPublication();
    publication.attach(driver.context);
    publication.detach();
    publication.update(snapshot({}));
    await publication.settled();
    expect(driver.published).toHaveLength(0);
    expect(driver.states).toHaveLength(0);
  });
});
