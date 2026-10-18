import { formatBytes, type SyncthingPeer } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { moment } from '../../../format/time';

export type PeerTone = 'positive' | 'warning' | 'neutral';

const PHONE = /phone|pixel|galaxy|iphone|android/i;
const SERVER = /nas|server|pi\b|raspberry|synology|unraid/i;

export function peerTone(peer: SyncthingPeer): PeerTone {
  if (peer.paused) {
    return 'warning';
  }
  return peer.connected ? 'positive' : 'neutral';
}

export function peerGlyph(name: string): IconName {
  if (PHONE.test(name)) {
    return 'smartphone';
  }
  return SERVER.test(name) ? 'server' : 'monitor';
}

function lastKnown(peer: SyncthingPeer): string {
  if (peer.paused) {
    return 'Last known: paused';
  }
  return peer.connected ? 'Last known: connected' : 'Last known: away';
}

export function peerStatus(peer: SyncthingPeer, now: number, stale: boolean): string {
  if (stale) {
    return lastKnown(peer);
  }
  if (peer.paused) {
    return 'Paused';
  }
  if (!peer.connected) {
    return peer.lastSeen === null
      ? 'Never connected'
      : `Away · last seen ${moment(peer.lastSeen, now)}`;
  }
  return peer.needBytes > 0
    ? `Syncing · ${formatBytes(peer.needBytes)} left`
    : 'Connected · up to date';
}

export function peerStateWord(peer: SyncthingPeer): string {
  if (peer.paused) {
    return 'Paused';
  }
  return peer.connected ? 'Connected' : 'Away';
}
