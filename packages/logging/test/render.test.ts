import { describe, expect, it } from 'vitest';
import { BACKGROUND, FOREGROUND, paint, withoutColour } from '../src/palette';
import { colourOfLevel, renderBanner, renderJson, renderPlain, renderPretty } from '../src/render';
import { describeFailure, type LogRecord } from '../src/record';
import { LOG_LEVELS } from '../src/levels';

const ESCAPE = '\u001B';

function recordWith(changes: Partial<LogRecord> = {}): LogRecord {
  return {
    timestamp: '2026-03-01T12:34:56.000Z',
    level: 'info',
    runtime: 'db',
    scope: 'db.automations',
    event: 'device.switched',
    payload: {},
    ...changes,
  };
}

describe('palette', () => {
  it('uses the standard terminal codes, so any terminal renders them', () => {
    expect(FOREGROUND).toEqual({
      black: `${ESCAPE}[30m`,
      red: `${ESCAPE}[31m`,
      green: `${ESCAPE}[32m`,
      yellow: `${ESCAPE}[33m`,
      blue: `${ESCAPE}[34m`,
      magenta: `${ESCAPE}[35m`,
      cyan: `${ESCAPE}[36m`,
      white: `${ESCAPE}[37m`,
      grey: `${ESCAPE}[90m`,
    });
    expect(BACKGROUND).toEqual({
      black: `${ESCAPE}[40m`,
      red: `${ESCAPE}[41m`,
      green: `${ESCAPE}[42m`,
      yellow: `${ESCAPE}[43m`,
      blue: `${ESCAPE}[44m`,
      magenta: `${ESCAPE}[45m`,
      cyan: `${ESCAPE}[46m`,
      white: `${ESCAPE}[47m`,
      grey: `${ESCAPE}[100m`,
    });
  });

  it('wraps text in a colour and closes it again', () => {
    expect(paint('hello', 'red')).toBe(`${ESCAPE}[31mhello${ESCAPE}[0m`);
  });

  it('strips every control sequence back out', () => {
    expect(withoutColour(paint('hello', 'red'))).toBe('hello');
  });

  it('leaves text that was never coloured alone', () => {
    expect(withoutColour('hello')).toBe('hello');
  });
});

describe('level colours', () => {
  it('gives every level a colour, and the loud levels the loud colours', () => {
    expect(LOG_LEVELS.map(colourOfLevel)).toEqual([
      'grey',
      'grey',
      'green',
      'yellow',
      'red',
      'magenta',
      'white',
    ]);
  });
});

describe('rendering', () => {
  it('writes the time, the level and the scope, in that order', () => {
    expect(withoutColour(renderPretty(recordWith()))).toBe(
      '[12:34:56]-[INFO]-[db.automations]: device.switched',
    );
  });

  it('writes the same line without colour when asked for plain', () => {
    expect(renderPlain(recordWith())).toBe('[12:34:56]-[INFO]-[db.automations]: device.switched');
  });

  it('shows how long an operation took', () => {
    expect(renderPlain(recordWith({ durationMs: 42 }))).toContain('(42ms)');
    expect(withoutColour(renderPretty(recordWith({ durationMs: 42 })))).toContain('(42ms)');
  });

  it('shows the payload when there is one, and nothing when there is not', () => {
    expect(renderPlain(recordWith({ payload: { sceneId: 'abc' } }))).toContain('sceneId=abc');
    expect(renderPlain(recordWith())).toBe('[12:34:56]-[INFO]-[db.automations]: device.switched');
  });

  it('writes the payload as readable pairs rather than a wall of JSON', () => {
    expect(renderPlain(recordWith({ payload: { room: 'kitchen', lights: 4 } }))).toBe(
      '[12:34:56]-[INFO]-[db.automations]: device.switched room=kitchen lights=4',
    );
  });

  it('puts the names in grey and the values in cyan, so values read off the line', () => {
    expect(renderPretty(recordWith({ payload: { room: 'kitchen' } }))).toContain(
      `${FOREGROUND.grey}room=${FOREGROUND.cyan}kitchen`,
    );
  });

  it('writes a nested value as JSON, because a pair cannot hold one', () => {
    expect(renderPlain(recordWith({ payload: { at: { deep: true } } }))).toContain(
      'at={"deep":true}',
    );
  });

  it('leaves out a key that carries no value, rather than printing undefined', () => {
    expect(renderPlain(recordWith({ payload: { sceneId: 'abc', missing: undefined } }))).toBe(
      '[12:34:56]-[INFO]-[db.automations]: device.switched sceneId=abc',
    );
  });

  it('still writes a value that is deliberately null', () => {
    expect(renderPlain(recordWith({ payload: { cancelledAt: null } }))).toContain(
      'cancelledAt=null',
    );
  });

  it('shows a failure with its stack underneath', () => {
    const failure = describeFailure(new Error('device offline'));
    expect(renderPlain(recordWith({ level: 'error', failure }))).toContain('Error: device offline');
    expect(renderPlain(recordWith({ level: 'error', failure }))).toContain('at ');
    expect(withoutColour(renderPretty(recordWith({ level: 'error', failure })))).toContain(
      'Error: device offline',
    );
  });

  it('adds nothing at all where a failure had no stack', () => {
    const failure = { name: 'UnknownFailure', message: 'a string was thrown' };
    expect(renderPlain(recordWith({ level: 'error', failure }))).toBe(
      '[12:34:56]-[ERROR]-[db.automations]: device.switched\nUnknownFailure: a string was thrown',
    );
  });

  it('puts the stack on its own lines beneath the message', () => {
    const failure = {
      name: 'Error',
      message: 'device offline',
      stack: 'Error: device offline\n    at here',
    };
    expect(renderPlain(recordWith({ level: 'error', failure }))).toBe(
      '[12:34:56]-[ERROR]-[db.automations]: device.switched\nError: device offline\n' +
        'Error: device offline\n    at here',
    );
  });

  it('shows a failure that never had a stack, without inventing one', () => {
    const failure = describeFailure('a string was thrown');
    expect(renderPlain(recordWith({ level: 'error', failure }))).toContain(
      'UnknownFailure: a string was thrown',
    );
    expect(withoutColour(renderPretty(recordWith({ level: 'error', failure })))).toContain(
      'UnknownFailure: a string was thrown',
    );
  });

  it('writes the whole record as JSON, losing nothing', () => {
    const record = recordWith({ payload: { sceneId: 'abc' }, durationMs: 7 });
    expect(JSON.parse(renderJson(record))).toEqual(record);
  });

  it('draws a banner on its own lines so it is impossible to miss', () => {
    expect(renderBanner('Applying migrations', 'blue')).toBe(
      `\n${ESCAPE}[44m${ESCAPE}[1m Applying migrations ${ESCAPE}[0m\n`,
    );
  });
});

describe('describing a failure', () => {
  it('keeps the name, the message and the stack of an Error', () => {
    const failure = describeFailure(new TypeError('wrong'));
    expect(failure.name).toBe('TypeError');
    expect(failure.message).toBe('wrong');
    expect(failure.stack).toContain('wrong');
  });

  it('describes anything else without pretending it was an Error', () => {
    expect(describeFailure(42)).toEqual({ name: 'UnknownFailure', message: '42' });
  });

  it('leaves out a stack an Error never had', () => {
    const bare = new Error('no stack');
    delete bare.stack;
    expect(describeFailure(bare)).not.toHaveProperty('stack');
  });
});
