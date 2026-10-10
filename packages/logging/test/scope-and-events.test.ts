import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { InvalidScopeError, RUNTIMES, areaOf, assertScope, isScope, runtimeOf } from '../src/scope';
import { InvalidEventNameError, assertEventName, isEventName } from '../src/event-name';
import { LOG_LEVELS, passesThreshold, rankOf } from '../src/levels';

describe('scope', () => {
  it('accepts a runtime and an area', () => {
    expect(isScope('app.devices')).toBe(true);
    expect(isScope('edge.health')).toBe(true);
    expect(isScope('db.automations')).toBe(true);
    expect(isScope('tool.migrate')).toBe(true);
  });

  it('accepts an area with hyphens between words', () => {
    expect(isScope('edge.deliver-notifications')).toBe(true);
  });

  it('rejects a runtime it does not know, so a typo cannot invent one', () => {
    expect(isScope('server.requests')).toBe(false);
  });

  it('rejects a scope with no area, because the runtime alone says too little', () => {
    expect(isScope('app')).toBe(false);
    expect(isScope('app.')).toBe(false);
  });

  it('rejects capitals, spaces and a trailing hyphen', () => {
    expect(isScope('app.Requests')).toBe(false);
    expect(isScope('app.two words')).toBe(false);
    expect(isScope('app.devices-')).toBe(false);
  });

  it('rejects a third segment, so the shape stays exactly runtime and area', () => {
    expect(isScope('app.devices.queue')).toBe(false);
  });

  it('accepts every runtime it declares', () => {
    for (const runtime of RUNTIMES) {
      expect(isScope(`${runtime}.area`)).toBe(true);
    }
  });

  it('names the runtime a scope belongs to', () => {
    expect(runtimeOf('edge.health')).toBe('edge');
    expect(runtimeOf('db.automations')).toBe('db');
    expect(runtimeOf('hub.commands')).toBe('hub');
    expect(runtimeOf('desktop.window')).toBe('desktop');
  });

  it('declares exactly the runtimes that emit logs', () => {
    expect(RUNTIMES).toStrictEqual(['app', 'edge', 'db', 'tool', 'hub', 'desktop']);
  });

  it('names the area a scope belongs to', () => {
    expect(areaOf('edge.deliver-notifications')).toBe('deliver-notifications');
  });

  it('refuses to read a runtime out of something that is not a scope', () => {
    expect(() => runtimeOf('nonsense')).toThrow(InvalidScopeError);
  });

  it('refuses to read an area out of something that is not a scope', () => {
    expect(() => areaOf('nonsense')).toThrow(InvalidScopeError);
  });

  it('returns the scope it was given when it is valid', () => {
    expect(assertScope('app.devices')).toBe('app.devices');
  });

  it('is anchored at the front, so a scope with anything before it is refused', () => {
    expect(isScope('use app.devices')).toBe(false);
  });

  it('names itself, so a catch block can tell it apart', () => {
    expect(new InvalidScopeError('x').name).toBe('InvalidScopeError');
    expect(new InvalidScopeError('x').received).toBe('x');
  });

  it('says what it wanted, listing the runtimes separated so they can be read', () => {
    expect(new InvalidScopeError('Nope').message).toBe(
      'a scope names the runtime that emitted the line and the area it belongs to, such as ' +
        '"app.devices", "edge.health" or "db.automations". The runtime is one of ' +
        'app, edge, db, tool, hub, desktop. Received "Nope"',
    );
  });

  it('throws that same explanation from assertScope', () => {
    let thrown: unknown;
    try {
      assertScope('Nope');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidScopeError);
    expect(String(thrown)).toContain(new InvalidScopeError('Nope').message);
  });
});

describe('event name', () => {
  it('accepts a dot separated name of two parts or more', () => {
    expect(isEventName('device.switched')).toBe(true);
    expect(isEventName('light.brightness.changed')).toBe(true);
  });

  it('accepts underscores inside a part', () => {
    expect(isEventName('purchase_order.delivered')).toBe(true);
  });

  it('rejects a single word, which says what but not about what', () => {
    expect(isEventName('switched')).toBe(false);
  });

  it('is anchored, so a valid name buried in a sentence is still refused', () => {
    expect(isEventName('switch of device.switched')).toBe(false);
  });

  it('names itself, so a catch block can tell it apart', () => {
    expect(new InvalidEventNameError('x').name).toBe('InvalidEventNameError');
    expect(new InvalidEventNameError('x').received).toBe('x');
  });

  it('says what a good event name looks like, not just that this one is bad', () => {
    expect(new InvalidEventNameError('x').message).toBe(
      'an event name is lower case, dot separated and at least two parts long, such as ' +
        '"device.switched". It names what happened and never carries a value. Received "x"',
    );
  });

  it('rejects capitals, spaces and interpolated values', () => {
    expect(isEventName('Device.Switched')).toBe(false);
    expect(isEventName('device switched')).toBe(false);
    expect(isEventName('device.switched.abc-123')).toBe(false);
  });

  it('rejects a leading or trailing dot', () => {
    expect(isEventName('.switched')).toBe(false);
    expect(isEventName('device.')).toBe(false);
  });

  it('returns the name it was given when it is valid', () => {
    expect(assertEventName('device.switched')).toBe('device.switched');
  });

  it('says what it received when it refuses', () => {
    let thrown: unknown;
    try {
      assertEventName('Switch failed for 42');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidEventNameError);
    expect(String(thrown)).toContain('Switch failed for 42');
  });

  it('never accepts a name containing a digit sequence that looks like an id', () => {
    fc.assert(
      fc.property(fc.uuid(), (identifier) => {
        expect(isEventName(`device.switched.${identifier}`)).toBe(false);
      }),
    );
  });
});

describe('levels', () => {
  it('orders the levels from quietest to loudest', () => {
    expect(LOG_LEVELS.map(rankOf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('lets a level through when it is at least as severe as the threshold', () => {
    expect(passesThreshold('error', 'info')).toBe(true);
    expect(passesThreshold('info', 'info')).toBe(true);
    expect(passesThreshold('debug', 'info')).toBe(false);
  });

  it('lets nothing through at all when the threshold is none', () => {
    for (const level of LOG_LEVELS) {
      expect(passesThreshold(level, 'none')).toBe(false);
    }
  });

  it('never lets the none level itself be written', () => {
    expect(passesThreshold('none', 'trace')).toBe(false);
  });

  it('agrees with its own ranking for every pair of levels', () => {
    for (const level of LOG_LEVELS) {
      for (const threshold of LOG_LEVELS) {
        const expected =
          level !== 'none' && threshold !== 'none' && rankOf(level) >= rankOf(threshold);
        expect(passesThreshold(level, threshold)).toBe(expected);
      }
    }
  });
});
