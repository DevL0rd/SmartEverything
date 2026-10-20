import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { BROADCAST_ADDRESS, WAKE_ON_LAN_PORT, magicPacket } from '@smarteverything/smartthings';
import { udpSender } from './udp-sender';

export const WAKE_REPEATS = 3;

const IPV4_OCTETS = 4;

const OCTET_MASK = 0xff;

export type InterfaceTable = () => NodeJS.Dict<readonly NetworkInterfaceInfo[]>;

export type PacketSender = (packet: Uint8Array, address: string) => Promise<void>;

export type WakeOnLan = (mac: string, host?: string | null) => Promise<void>;

function octetsOf(address: string): readonly number[] | null {
  const octets = address.split('.').map(Number);
  return octets.length === IPV4_OCTETS &&
    octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= OCTET_MASK)
    ? octets
    : null;
}

export function directedBroadcast(address: string, netmask: string): string | null {
  const host = octetsOf(address);
  const mask = octetsOf(netmask);
  if (host === null || mask === null) {
    return null;
  }
  return host.map((octet, index) => (octet | ~(mask[index] ?? 0)) & OCTET_MASK).join('.');
}

export function wakeAddresses(interfaces: InterfaceTable, host?: string | null): readonly string[] {
  const directed = Object.values(interfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .flatMap((entry) => directedBroadcast(entry.address, entry.netmask) ?? []);
  return [
    ...new Set([
      BROADCAST_ADDRESS,
      ...directed,
      ...(host === undefined || host === null ? [] : [host]),
    ]),
  ];
}

export function sendWakePackets(
  send: PacketSender,
  addresses: readonly string[],
  packet: Uint8Array,
): Promise<void> {
  const sends = addresses.flatMap((address) =>
    Array.from({ length: WAKE_REPEATS }, () => send(packet, address)),
  );
  return Promise.all(sends).then(() => undefined);
}

export function wakeOnLanWith(send: PacketSender, interfaces: InterfaceTable): WakeOnLan {
  return (mac, host) => sendWakePackets(send, wakeAddresses(interfaces, host), magicPacket(mac));
}

const udpSend: PacketSender = (packet, address) => udpSender(address, WAKE_ON_LAN_PORT)(packet);

export function sendMagicPacket(packet: Uint8Array, host: string): Promise<void> {
  return sendWakePackets(udpSend, wakeAddresses(networkInterfaces, host), packet);
}

export const wakeOnLan: WakeOnLan = wakeOnLanWith(udpSend, networkInterfaces);
