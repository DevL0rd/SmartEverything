import { BROADCAST_ADDRESS, WAKE_ON_LAN_PORT, magicPacket } from '@smarteverything/smartthings';
import { udpSender } from './udp-sender';

const broadcast = udpSender(BROADCAST_ADDRESS, WAKE_ON_LAN_PORT);

export type WakeOnLan = (mac: string) => Promise<void>;

export const wakeOnLan: WakeOnLan = (mac) => broadcast(magicPacket(mac));
