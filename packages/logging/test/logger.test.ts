import { stripVTControlCharacters } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../src/logger';
import { InvalidEventNameError } from '../src/event-name';
import { InvalidScopeError } from '../src/scope';
import { REDACTED } from '../src/redaction';
import type { LogRecord } from '../src/record';

let written: LogRecord[] = [];
let clock = 0;

const BASE = Date.UTC(2026, 2, 1, 12, 0, 0);

function freezeClock(): void {
  clock = 0;
  Logger.configure({ now: () => new Date(BASE + clock) });
}

function advance(milliseconds: number): void {
  clock += milliseconds;
}

beforeEach(() => {
  written = [];
  Logger.configure({
    level: 'trace',
    sink: (record) => {
      written.push(record);
    },
  });
  freezeClock();
});

afterEach(() => {
  Logger.reset();
  vi.restoreAllMocks();
});

describe('Logger', () => {
  it('refuses a scope that does not name a runtime and an area', () => {
    expect(() => new Logger('requests')).toThrow(InvalidScopeError);
  });

  it('refuses an event name that carries a value instead of naming what happened', () => {
    const logger = new Logger('db.automations');
    expect(() => {
      logger.info('Switched device 42');
    }).toThrow(InvalidEventNameError);
  });

  it('carries the scope, the runtime and the level on every line', () => {
    new Logger('db.automations').info('device.switched', { sceneId: 'abc' });
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      scope: 'db.automations',
      runtime: 'db',
      level: 'info',
      event: 'device.switched',
      payload: { sceneId: 'abc' },
    });
  });

  it('stamps an ISO timestamp in UTC', () => {
    new Logger('app.devices').info('device.paired');
    expect(written[0]?.timestamp).toBe('2026-03-01T12:00:00.000Z');
  });

  it('carries the payload at every level, not only the ones that report a failure', () => {
    const logger = new Logger('app.devices');
    logger.trace('a.b', { at: 'trace' });
    logger.debug('a.b', { at: 'debug' });
    logger.info('a.b', { at: 'info' });
    logger.warn('a.b', { at: 'warn' });
    logger.error('a.b', undefined, { at: 'error' });
    logger.exception('a.b', new Error('boom'), { at: 'exception' });
    expect(written.map((record) => record.payload)).toEqual([
      { at: 'trace' },
      { at: 'debug' },
      { at: 'info' },
      { at: 'warn' },
      { at: 'error' },
      { at: 'exception' },
    ]);
  });

  it('carries the payload on the line that opens an operation', () => {
    new Logger('db.automations').operation('scene.run', { sceneId: 'abc' });
    expect(written[0]).toMatchObject({
      event: 'scene.run.started',
      payload: { sceneId: 'abc' },
    });
  });

  it('writes every level it is asked for', () => {
    const logger = new Logger('app.devices');
    logger.trace('a.b');
    logger.debug('a.b');
    logger.info('a.b');
    logger.warn('a.b');
    logger.error('a.b');
    logger.exception('a.b', new Error('boom'));
    expect(written.map((record) => record.level)).toEqual([
      'trace',
      'debug',
      'info',
      'warn',
      'error',
      'exception',
    ]);
  });

  it('drops anything below the configured level', () => {
    Logger.configure({ level: 'warn' });
    const logger = new Logger('app.devices');
    logger.info('a.b');
    logger.debug('a.b');
    logger.warn('a.b');
    expect(written.map((record) => record.level)).toEqual(['warn']);
  });

  it('never builds a lazy payload when its level is off', () => {
    Logger.configure({ level: 'info' });
    const build = vi.fn(() => ({ rows: 3 }));
    const logger = new Logger('app.devices');
    logger.debug('a.b', build);
    logger.trace('a.b', build);
    expect(build).not.toHaveBeenCalled();
    expect(written).toEqual([]);
  });

  it('builds a lazy payload once when its level is on and redacts what it returns', () => {
    const build = vi.fn(() => ({ rows: 3, email: 'worker@example.com' }));
    const logger = new Logger('app.devices');
    logger.debug('a.b', build);
    logger.trace('a.b', build);
    expect(build).toHaveBeenCalledTimes(2);
    expect(written.map((record) => record.payload)).toEqual([
      { rows: 3, email: REDACTED },
      { rows: 3, email: REDACTED },
    ]);
  });

  it('writes no start line for an operation when debug is off, but still ends it', () => {
    Logger.configure({ level: 'info' });
    new Logger('db.automations').operation('scene.run', { sceneId: 'abc' }).succeeded();
    expect(written.map((record) => record.event)).toEqual(['scene.run.succeeded']);
  });

  it('redacts a denied field before it ever reaches the sink', () => {
    new Logger('app.sign-in').info('sign_in.requested', { email: 'worker@example.com' });
    expect(written[0]?.payload).toEqual({ email: REDACTED });
  });

  it('describes an Error cause without losing its stack', () => {
    new Logger('db.automations').error('scene.crashed', new Error('boom'));
    expect(written[0]?.failure?.name).toBe('Error');
    expect(written[0]?.failure?.message).toBe('boom');
    expect(written[0]?.failure?.stack).toContain('boom');
  });

  it('describes a thrown value that is not an Error at all', () => {
    new Logger('db.automations').error('scene.crashed', 'a string was thrown');
    expect(written[0]?.failure).toEqual({
      name: 'UnknownFailure',
      message: 'a string was thrown',
    });
  });

  it('leaves out the failure entirely when there was none', () => {
    new Logger('db.automations').info('device.switched');
    expect(written[0]).not.toHaveProperty('failure');
  });

  it('takes the context set once for the whole process', () => {
    Logger.configure({ context: { release: '1.2.3', platform: 'server' } });
    new Logger('edge.health').info('notification.delivered');
    expect(written[0]).toMatchObject({ release: '1.2.3', platform: 'server' });
  });

  it('lets a child add context without touching its parent', () => {
    const parent = new Logger('app.devices');
    const child = parent.child({ deviceId: 'device-1' });
    child.info('device.paired');
    parent.info('device.paired');
    expect(written[0]?.deviceId).toBe('device-1');
    expect(written[1]?.deviceId).toBeUndefined();
  });

  it('lets a logger move to another area, keeping the context it gathered', () => {
    const logger = new Logger('app.devices', { deviceId: 'device-1' });
    logger.forArea('app.items').info('item.opened');
    expect(written[0]).toMatchObject({ scope: 'app.items', deviceId: 'device-1' });
  });

  it('prefers the logger context over the process context', () => {
    Logger.configure({ context: { deviceId: 'from-process' } });
    new Logger('app.devices', { deviceId: 'from-logger' }).info('device.paired');
    expect(written[0]?.deviceId).toBe('from-logger');
  });

  it('leaves out how long it took on a line that is not the end of an operation', () => {
    new Logger('app.devices').info('device.paired');
    expect(written[0]).not.toHaveProperty('durationMs');
  });

  it('reports an operation as started then succeeded, with how long it took', () => {
    const finish = new Logger('db.automations').operation('scene.run', {
      sceneId: 'abc',
    });
    advance(1500);
    finish.succeeded({ lines: 3 });
    expect(written.map((record) => record.event)).toEqual([
      'scene.run.started',
      'scene.run.succeeded',
    ]);
    expect(written[0]?.durationMs).toBeUndefined();
    expect(written[1]?.durationMs).toBe(1500);
    expect(written[1]?.payload).toEqual({ sceneId: 'abc', lines: 3 });
  });

  it('reports an operation that failed at error level, with the cause', () => {
    const finish = new Logger('db.automations').operation('scene.run');
    finish.failed(new Error('device offline'), { room: 'kitchen' });
    expect(written[1]).toMatchObject({
      event: 'scene.run.failed',
      level: 'error',
      payload: { room: 'kitchen' },
    });
    expect(written[1]?.failure?.message).toBe('device offline');
  });

  it('refuses an operation whose name is not an event name, naming what it was given', () => {
    let thrown: unknown;
    try {
      new Logger('db.automations').operation('Switching');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidEventNameError);
    expect(String(thrown)).toContain('"Switching"');
    expect(written).toEqual([]);
  });

  it('says nothing at all when the level is none', () => {
    Logger.configure({ level: 'none' });
    const logger = new Logger('app.devices');
    logger.error('a.b');
    expect(written).toEqual([]);
  });

  it('reads the real clock until it is given another one', () => {
    Logger.reset();
    Logger.configure({
      sink: (record) => {
        written.push(record);
      },
    });
    const before = Date.now();
    new Logger('app.devices').info('device.paired');
    const stamped = Date.parse(String(written[0]?.timestamp));
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });

  it('changes only what it is given, leaving the rest of the settings alone', () => {
    Logger.configure({ style: 'json', context: { release: '1.0.0' } });
    Logger.configure({ level: 'warn' });
    Logger.configure({ context: { deviceId: 'device-1' } });
    new Logger('app.devices').warn('request.refused');
    expect(Logger.level).toBe('warn');
    expect(written[0]).toMatchObject({ release: '1.0.0', deviceId: 'device-1' });
  });

  it('adds to the process context rather than replacing it', () => {
    Logger.configure({ context: { release: '1.0.0' } });
    Logger.configure({ context: { platform: 'web' } });
    new Logger('app.devices').info('device.paired');
    expect(written[0]).toMatchObject({ release: '1.0.0', platform: 'web' });
  });

  it('hands every record to a tap as well as to the sink', () => {
    const tapped: LogRecord[] = [];
    Logger.configure({
      tap: (record) => {
        tapped.push(record);
      },
    });
    new Logger('app.devices').info('device.paired');
    expect(tapped).toEqual(written);
    expect(tapped).toHaveLength(1);
  });

  it('reports the level it is set to', () => {
    Logger.configure({ level: 'debug' });
    expect(Logger.level).toBe('debug');
  });

  it('starts at info, so debug detail never ships by accident', () => {
    Logger.reset();
    expect(Logger.level).toBe('info');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    new Logger('app.devices').debug('request.inspected');
    new Logger('app.devices').info('device.paired');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('starts pretty, because the first reader is a person at a terminal', () => {
    Logger.reset();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    new Logger('app.devices').info('device.paired');
    expect(String(spy.mock.calls[0]?.[0])).toContain('\u001B[');
  });

  it('starts with no context, so nothing leaks between processes', () => {
    Logger.configure({ context: { release: '9' } });
    Logger.reset();
    Logger.configure({
      sink: (record) => {
        written.push(record);
      },
    });
    new Logger('app.devices').info('device.paired');
    expect(written[0]).not.toHaveProperty('release');
  });

  it('goes back to its defaults when reset', () => {
    Logger.configure({ level: 'trace', style: 'json', context: { release: '9' } });
    Logger.reset();
    expect(Logger.level).toBe('info');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    new Logger('app.devices').info('device.paired');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).not.toContain('"release":"9"');
  });
});

describe('Logger writing to the console', () => {
  beforeEach(() => {
    Logger.reset();
    Logger.configure({ level: 'trace' });
    freezeClock();
  });

  it('writes a coloured line by default, because a person is usually reading it', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    new Logger('app.devices').info('device.paired');
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).toContain('\u001B[');
    expect(stripVTControlCharacters(line)).toBe('[12:00:00]-[INFO]-[app.devices]: device.paired');
  });

  it('writes every level through console.log when the host asks for log-only routing', () => {
    Logger.configure({ consoleRouting: 'log-only' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    new Logger('app.devices').error('request.crashed', new Error('boom'));
    expect(log).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('keeps info off the console but still taps it when the host asks for warnings-only routing', () => {
    const tap = vi.fn();
    Logger.configure({ consoleRouting: 'warnings-only', tap });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = new Logger('app.devices');
    logger.info('device.paired');
    logger.warn('request.refused');
    logger.error('request.crashed', new Error('boom'));
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(tap).toHaveBeenCalledTimes(3);
  });

  it('writes a warning through console.warn, so a host can route it', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    new Logger('app.devices').warn('request.refused');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('writes an error and an exception through console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    new Logger('app.devices').error('request.crashed', new Error('boom'));
    new Logger('app.devices').exception('request.crashed', new Error('boom'));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('writes machine readable JSON when asked for it', () => {
    Logger.configure({ style: 'json' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    new Logger('app.devices').info('device.paired', { sceneId: 'abc' });
    expect(String(spy.mock.calls[0]?.[0])).toContain('"event":"device.paired"');
  });

  it('writes an uncoloured line when asked for plain output', () => {
    Logger.configure({ style: 'plain' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    new Logger('app.devices').info('device.paired');
    expect(String(spy.mock.calls[0]?.[0])).toBe('[12:00:00]-[INFO]-[app.devices]: device.paired');
  });
});
