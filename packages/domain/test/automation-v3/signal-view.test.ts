import { describe, expect, it } from 'vitest';
import { signalViewOf, signalViewsOf } from '../../src/automation-v3/signal-view';
import { ids } from './describe-fixture';

describe('signalViewOf', () => {
  it('reads a signal trigger as written', () => {
    expect(
      signalViewOf({
        kind: 'trigger.signal',
        ports: {
          source: { lit: 'device' },
          kind: { lit: 'state' },
          subject: { lit: ids.lamp },
          field: { lit: 'power' },
          match: { lit: { cause: 'manual' } },
        },
      }),
    ).toEqual({
      source: 'device',
      kind: 'state',
      subject: ids.lamp,
      field: 'power',
      match: { cause: 'manual' },
    });
  });

  it('leaves out what a signal does not name', () => {
    expect(
      signalViewOf({
        kind: 'trigger.signal',
        ports: { source: { lit: 'device' }, kind: { lit: 'state' } },
      }),
    ).toEqual({ source: 'device', kind: 'state' });
  });

  it('gives a device-flavoured trigger the same view', () => {
    const button = signalViewOf({
      kind: 'trigger.button',
      ports: { device: { lit: ids.switchDevice }, press: { lit: 'single_press' } },
    });
    const signal = signalViewOf({
      kind: 'trigger.signal',
      ports: {
        source: { lit: 'event' },
        kind: { lit: 'button' },
        subject: { lit: ids.switchDevice },
        match: { lit: { action: 'single_press' } },
      },
    });
    expect(button).toEqual(signal);
    expect(button).toEqual({
      source: 'event',
      kind: 'button',
      subject: ids.switchDevice,
      match: { action: 'single_press' },
    });
  });

  it('keeps the control of a device trigger as the field', () => {
    expect(
      signalViewOf({
        kind: 'trigger.device',
        ports: { device: { lit: ids.lamp }, control: { lit: 'brightness' } },
      }),
    ).toEqual({ source: 'device', kind: 'state', subject: ids.lamp, field: 'brightness' });
  });

  it('has no view for a trigger that is not a signal, or one with a computed source', () => {
    expect(signalViewOf({ kind: 'trigger.time', ports: { at: { lit: '07:00' } } })).toBeUndefined();
    expect(signalViewOf({ kind: 'trigger.device', ports: {} })).toBeUndefined();
    expect(
      signalViewOf({
        kind: 'trigger.signal',
        ports: { source: { wire: { from: 'x', port: 'source' } }, kind: { lit: 'state' } },
      }),
    ).toBeUndefined();
  });

  it('lists the views of the triggers that have one', () => {
    const views = signalViewsOf([
      { id: ids.trigger, kind: 'trigger.button', ports: { device: { lit: ids.lamp } } },
      { id: ids.node, kind: 'trigger.time', ports: {} },
    ]);
    expect(views).toHaveLength(1);
    expect(views[0]?.triggerId).toBe(ids.trigger);
  });
});
