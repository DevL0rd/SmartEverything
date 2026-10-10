import { createSocket } from 'node:dgram';
import { isIPv4 } from 'node:net';
import { networkInterfaces } from 'node:os';

const PROBE_ADDRESS = '1.1.1.1';
const PROBE_PORT = 53;

const VIRTUAL_NAME =
  /vethernet|virtual|vmware|virtualbox|docker|wsl|hyper-v|virbr|br-|tailscale|zt/i;
const WIFI_NAME = /wi-?fi|wlan|wlp/i;
const WIRED_NAME = /ethernet|eth|enp|eno/i;
const PRIVATE_172 = /^172\.(1[6-9]|2\d|3[01])\./;

const WIFI_SCORE = 30;
const WIRED_SCORE = 20;
const HOME_SCORE = 10;
const OFFICE_SCORE = 8;
const CAMPUS_SCORE = 6;
const VIRTUAL_PENALTY = 50;

class RobotAddressNotOursError extends Error {
  override readonly name = 'RobotAddressNotOursError';

  constructor(readonly address: string) {
    super(`${address} is not an address of this computer`);
  }
}

function usableIPv4(address: string): boolean {
  return isIPv4(address) && !address.startsWith('127.') && !address.startsWith('169.254.');
}

function outbound(): Promise<string> {
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    let finished = false;
    const done = (address: string): void => {
      if (finished) {
        return;
      }
      finished = true;
      resolve(address);
      socket.close();
    };
    socket.once('error', () => {
      done('');
    });
    socket.connect(PROBE_PORT, PROBE_ADDRESS, () => {
      const { address } = socket.address();
      done(usableIPv4(address) ? address : '');
    });
  });
}

function score(name: string, address: string): number {
  let value = 0;
  value += WIFI_NAME.test(name) ? WIFI_SCORE : 0;
  value += WIRED_NAME.test(name) ? WIRED_SCORE : 0;
  value += address.startsWith('192.168.') ? HOME_SCORE : 0;
  value += address.startsWith('10.') ? OFFICE_SCORE : 0;
  value += PRIVATE_172.test(address) ? CAMPUS_SCORE : 0;
  value -= VIRTUAL_NAME.test(name) ? VIRTUAL_PENALTY : 0;
  return value;
}

function lanAddresses(): { readonly name: string; readonly address: string }[] {
  return Object.entries(networkInterfaces())
    .flatMap(([name, entries]) =>
      (entries ?? [])
        .filter((entry) => entry.family === 'IPv4' && !entry.internal && usableIPv4(entry.address))
        .map((entry) => ({ name, address: entry.address })),
    )
    .sort((a, b) => score(b.name, b.address) - score(a.name, a.address));
}

export async function lanAddress(configured: string): Promise<string> {
  if (configured !== '') {
    if (!lanAddresses().some((entry) => entry.address === configured)) {
      throw new RobotAddressNotOursError(configured);
    }
    return configured;
  }
  const found = await outbound();
  return found === '' ? (lanAddresses()[0]?.address ?? '') : found;
}
