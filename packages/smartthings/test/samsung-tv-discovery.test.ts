import { describe, expect, it } from 'vitest';
import {
  SSDP_ADDRESS,
  SSDP_PORT,
  SSDP_TARGET,
  SSDP_WAIT_SECONDS,
  candidateOf,
  readSsdpAnswer,
  readSsdpAnnouncement,
  ssdpSearchMessage,
} from '../src/samsung-tv/discovery';
import { readDeviceInfo } from '../src/samsung-tv/power';

const ANSWER = [
  'HTTP/1.1 200 OK',
  'CACHE-CONTROL: max-age=1800',
  'EXT:',
  'LOCATION: http://192.168.1.50:7676/smp_2_',
  'SERVER: SHP, UPnP/1.0, Samsung UPnP SDK/1.0',
  `ST: ${SSDP_TARGET}`,
  `USN: uuid:0b5c7a3e-1d2f-4c6a-9e8b-5a4d3c2b1a09::${SSDP_TARGET}`,
  '',
  '',
].join('\r\n');

function infoOf(device: Record<string, unknown>): ReturnType<typeof readDeviceInfo> {
  return readDeviceInfo({ type: 'Samsung SmartTV', device });
}

describe('searching the network for Samsung televisions', () => {
  it('asks the multicast group for the remote control receiver', () => {
    expect(SSDP_ADDRESS).toBe('239.255.255.250');
    expect(SSDP_PORT).toBe(1900);
    expect(ssdpSearchMessage()).toBe(
      [
        'M-SEARCH * HTTP/1.1',
        'HOST: 239.255.255.250:1900',
        'MAN: "ssdp:discover"',
        `MX: ${String(SSDP_WAIT_SECONDS)}`,
        `ST: ${SSDP_TARGET}`,
        '',
        '',
      ].join('\r\n'),
    );
  });

  it('takes the television address from the answer location', () => {
    expect(readSsdpAnswer(ANSWER, '10.0.0.9')).toBe('192.168.1.50');
  });

  it('falls back to the sender when the location is missing or unusable', () => {
    const without = ANSWER.replace(/LOCATION:.*\r\n/, '');
    expect(readSsdpAnswer(without, '10.0.0.9')).toBe('10.0.0.9');
    const broken = ANSWER.replace(/LOCATION:.*\r\n/, 'LOCATION: not a url\r\n');
    expect(readSsdpAnswer(broken, '10.0.0.9')).toBe('10.0.0.9');
  });

  it('ignores answers from other devices and other messages', () => {
    expect(readSsdpAnswer(ANSWER.replace(SSDP_TARGET, 'upnp:rootdevice'), '10.0.0.9')).toBeNull();
    expect(readSsdpAnswer(ANSWER.replace(/ST:.*\r\n/, ''), '10.0.0.9')).toBeNull();
    expect(readSsdpAnswer('NOTIFY * HTTP/1.1\r\nST: x\r\n\r\n', '10.0.0.9')).toBeNull();
    expect(readSsdpAnswer('', '10.0.0.9')).toBeNull();
  });

  it('accepts the target in any case and skips lines that are not headers', () => {
    const shouted = ANSWER.replace(SSDP_TARGET, SSDP_TARGET.toUpperCase()).replace(
      'EXT:',
      'junk line',
    );
    expect(readSsdpAnswer(shouted, '10.0.0.9')).toBe('192.168.1.50');
  });
});

describe('a television found on the network', () => {
  const info = infoOf({
    name: '[TV] Samsung S95B',
    modelName: 'QE65S95BAUXXN',
    wifiMac: 'AA:BB:CC:DD:EE:FF',
  });

  it('carries its name, model and address, lower-cased', () => {
    expect(candidateOf('192.168.1.50', info, 'QA65S95BAKXXT')).toEqual({
      host: '192.168.1.50',
      name: '[TV] Samsung S95B',
      model: 'QE65S95BAUXXN',
      macAddress: 'aa:bb:cc:dd:ee:ff',
      likely: true,
    });
  });

  it('is likely only when its model matches the SmartThings television apart from the region', () => {
    expect(candidateOf('h', info, 'QA65S95BAKXXT').likely).toBe(true);
    expect(candidateOf('h', info, 'QA55S90CAKXXT').likely).toBe(false);
    expect(candidateOf('h', infoOf({}), 'QA65S95BAKXXT').likely).toBe(false);
  });

  it('names itself by model, then by address, and drops an address it cannot read', () => {
    expect(candidateOf('h', infoOf({ modelName: 'QE65S95C', wifiMac: 'nope' }), 'x')).toMatchObject(
      {
        name: 'QE65S95C',
        macAddress: null,
      },
    );
    expect(candidateOf('192.168.1.50', infoOf({}), 'x')).toMatchObject({
      name: '192.168.1.50',
      model: null,
      macAddress: null,
    });
  });
});

describe('hearing a television announce itself', () => {
  const notify = (nts: string, nt = SSDP_TARGET): string =>
    [
      'NOTIFY * HTTP/1.1',
      'HOST: 239.255.255.250:1900',
      'LOCATION: http://192.168.1.77:7676/smp_2_',
      `NT: ${nt}`,
      `NTS: ${nts}`,
      '',
      '',
    ].join('\r\n');

  it('takes the address from an alive or update announcement of the remote control receiver', () => {
    expect(readSsdpAnnouncement(notify('ssdp:alive'), '10.0.0.1')).toBe('192.168.1.77');
    expect(readSsdpAnnouncement(notify('ssdp:update'), '10.0.0.1')).toBe('192.168.1.77');
  });

  it('ignores goodbyes, other devices and search answers', () => {
    expect(readSsdpAnnouncement(notify('ssdp:byebye'), '10.0.0.1')).toBeNull();
    expect(readSsdpAnnouncement(notify('ssdp:alive', 'upnp:rootdevice'), '10.0.0.1')).toBeNull();
    expect(readSsdpAnnouncement(ANSWER, '10.0.0.1')).toBeNull();
  });
});
