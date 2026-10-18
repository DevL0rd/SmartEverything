import { describe, expect, it } from 'vitest';
import { countersOf, kindOf, signalsOf } from '../../src/node/collectors/linux/network';

describe('countersOf', () => {
  it('reads received and sent bytes of every interface', () => {
    const text = [
      'Inter-|   Receive                                                |  Transmit',
      ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed',
      '    lo: 1000 10 0 0 0 0 0 0 2000 10 0 0 0 0 0 0',
      '  eth0: 5000 50 0 0 0 0 0 0 7000 40 0 0 0 0 0 0',
    ].join('\n');
    const counters = countersOf(text, 42);
    expect(counters.get('eth0')).toEqual({ received: 5000, sent: 7000, at: 42 });
    expect(counters.get('lo')?.sent).toBe(2000);
    expect(counters.size).toBe(2);
  });
});

describe('signalsOf', () => {
  it('turns the link quality out of 70 into a percentage', () => {
    const text = [
      'Inter-| sta-|   Quality        |   Discarded packets',
      ' face | tus | link level noise |  nwid  crypt',
      'wlan0: 0000   35.  -60.  -256        0      0',
    ].join('\n');
    expect(signalsOf(text).get('wlan0')).toBe(50);
  });

  it('is empty when no wireless adapter reports', () => {
    expect(signalsOf('Inter-|\n face |\n').size).toBe(0);
  });
});

describe('kindOf', () => {
  it('calls the loopback device other and a wireguard name a vpn', () => {
    expect(kindOf('wg0')).toBe('vpn');
    expect(kindOf('definitely-not-here')).toBe('other');
  });
});
