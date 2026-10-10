import { describe, expect, it } from 'vitest';
import {
  InvalidMacAddressError,
  SamsungTvMessageError,
  SmartThingsCommandError,
  SmartThingsResponseError,
} from '../src/errors';

describe('the named errors', () => {
  it('carry their own names and the fields they were built from', () => {
    const response = new SmartThingsResponseError('device', { a: 1 }, 'missing id');
    expect(response.name).toBe('SmartThingsResponseError');
    expect([response.subject, response.received, response.reason]).toEqual([
      'device',
      { a: 1 },
      'missing id',
    ]);
    const command = new SmartThingsCommandError('switch', 3, 'expected true or false');
    expect(command.name).toBe('SmartThingsCommandError');
    expect([command.capability, command.received, command.reason]).toEqual([
      'switch',
      3,
      'expected true or false',
    ]);
    const message = new SamsungTvMessageError('x', 'no event name');
    expect(message.name).toBe('SamsungTvMessageError');
    expect([message.received, message.reason]).toEqual(['x', 'no event name']);
    const mac = new InvalidMacAddressError('zz');
    expect(mac.name).toBe('InvalidMacAddressError');
    expect(mac.received).toBe('zz');
  });
});
