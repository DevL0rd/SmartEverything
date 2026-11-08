import { createHash } from 'node:crypto';
import type {
  CameraReach,
  UnlearnedDevice,
  FirewallOpening,
  FirewallPlan,
  FirewallStatus,
  LowPorts,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DeviceRecord } from '../database/port';
import { announcementsOf, camerasOf, identified, pushingOf, unlearnedOf } from './device-sources';
import { lanNetworks } from './lan-networks';
import { probeLinux } from './linux';
import { lowPortsOf } from './low-ports';
import { probeMac } from './macos';
import { neighborMacs } from './neighbors';
import {
  always,
  requiredOpenings,
  type AnnouncementNeed,
  type ConnectionPortNeed,
  type DeviceAddress,
  type OpeningState,
  type PlanDraft,
  type PluginPortNeed,
  type Probe,
  type Prober,
} from './openings';
import type { FirewallPlatform, FirewallSystem } from './system';
import { probeWindows } from './windows';
import { messageOf } from '@smarteverything/logging';

const PROBES: Readonly<Record<FirewallPlatform, Prober>> = {
  linux: probeLinux,
  darwin: probeMac,
  win32: probeWindows,
};

export interface DeviceMacs {
  readonly all: () => ReadonlyMap<string, string>;
  readonly remember: (deviceId: string, mac: string) => void;
}

export interface FirewallMonitorOptions {
  readonly system: FirewallSystem;
  readonly macs: DeviceMacs;
  readonly webrtcPort: number;
  readonly now: () => Date;
  readonly log: Logger;
}

export type FirewallListener = (status: FirewallStatus) => void;

interface Checked {
  readonly probe: Probe;
  readonly openings: readonly FirewallOpening[];
  readonly lowPorts: LowPorts | null;
  readonly unlearned: readonly UnlearnedDevice[];
  readonly checkedAt: string;
}

function failedProbe(cause: unknown): Probe {
  return {
    backend: 'unknown',
    filtering: null,
    detail: `The firewall could not be read: ${messageOf(cause)}`,
    stateOf: always('unknown'),
    draft: null,
    fixable: new Set(),
    watch: [],
  };
}

function withLowPorts(draft: PlanDraft | null, lowPorts: LowPorts | null): PlanDraft | null {
  if (lowPorts?.state !== 'missing') {
    return draft;
  }
  if (draft === null) {
    return { backend: 'sysctl', unprivilegedPortStart: lowPorts.start };
  }
  return draft.backend === 'ufw' || draft.backend === 'firewalld'
    ? { ...draft, unprivilegedPortStart: lowPorts.start }
    : draft;
}

function revisionOf(draft: PlanDraft): FirewallPlan {
  const revision = createHash('sha256').update(JSON.stringify(draft)).digest('hex').slice(0, 16);
  return { ...draft, revision };
}

function reachOf(state: OpeningState, failedAt: string | null): CameraReach['state'] {
  if (failedAt !== null) {
    return state === 'open' ? 'unreachable' : 'blocked';
  }
  if (state === 'open' || state === 'unknown') {
    return state;
  }
  return 'needs_rule';
}

export class FirewallMonitor {
  private cameras: readonly DeviceAddress[] = [];
  private pushing: readonly DeviceAddress[] = [];
  private announcements: readonly AnnouncementNeed[] = [];
  private plugins: readonly PluginPortNeed[] = [];
  private devicesKey = '';
  private pluginsKey = '';
  private warnedNoLan = false;
  private checked: Checked | null = null;
  private readonly failures = new Map<string, string>();
  private readonly listeners = new Set<FirewallListener>();
  private readonly watchers = new Map<string, () => void>();
  private connectionNeeds: readonly ConnectionPortNeed[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private pending: Promise<FirewallStatus> | null = null;
  private last = '';

  constructor(private readonly options: FirewallMonitorOptions) {}

  onChange(listener: FirewallListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  current(): Promise<FirewallStatus> {
    const checked = this.checked;
    return checked === null ? this.check() : Promise.resolve(this.statusOf(checked));
  }

  check(): Promise<FirewallStatus> {
    if (this.pending === null) {
      const next = this.queue.then(() => {
        this.pending = null;
        return this.checkNow();
      });
      this.pending = next;
      this.queue = next.then(
        () => undefined,
        () => undefined,
      );
    }
    return this.pending;
  }

  devicesChanged(devices: readonly DeviceRecord[]): void {
    const cameras = camerasOf(devices, this.options.log);
    const pushing = pushingOf(devices, this.options.log);
    const announcements = announcementsOf(devices);
    const key = JSON.stringify({ cameras, pushing, announcements });
    if (key === this.devicesKey) {
      return;
    }
    this.cameras = cameras;
    this.pushing = pushing;
    this.announcements = announcements;
    this.devicesKey = key;
    this.recheck();
  }

  connectionsChanged(needs: readonly ConnectionPortNeed[]): void {
    if (JSON.stringify(needs) === JSON.stringify(this.connectionNeeds)) return;
    this.connectionNeeds = needs;
    this.recheck();
  }

  pluginsChanged(needs: readonly PluginPortNeed[]): void {
    const key = JSON.stringify(needs);
    if (key === this.pluginsKey) {
      return;
    }
    this.plugins = needs;
    this.pluginsKey = key;
    this.recheck();
  }

  private recheck(): void {
    this.check().catch((cause: unknown) => {
      this.options.log.error('firewall.check_crashed', cause);
    });
  }

  cameraFailed(deviceId: string): void {
    this.failures.set(deviceId, this.options.now().toISOString());
    this.republish();
  }

  cameraRecovered(deviceId: string): void {
    if (this.failures.delete(deviceId)) {
      this.republish();
    }
  }

  blockingAddress(deviceId: string): string | null {
    const checked = this.checked;
    if (checked === null) {
      return null;
    }
    const reach = this.reach(checked.openings).find((camera) => camera.deviceId === deviceId);
    return reach !== undefined && (reach.state === 'blocked' || reach.state === 'needs_rule')
      ? reach.address
      : null;
  }

  stop(): void {
    for (const close of this.watchers.values()) {
      close();
    }
    this.watchers.clear();
    this.listeners.clear();
  }

  private async checkNow(): Promise<FirewallStatus> {
    const { system, webrtcPort, log } = this.options;
    const probe = await PROBES[system.platform](system).catch((cause: unknown) => {
      log.warn('firewall.read_failed', {
        reason: messageOf(cause),
      });
      return failedProbe(cause);
    });
    const networks = this.needsNetworks() ? await lanNetworks(system.read) : [];
    this.warnNoLan(networks);
    const known = await this.learnMacs();
    const cameras = identified(this.cameras, known);
    const pushing = identified(this.pushing, known);
    const openings = requiredOpenings({
      connections: this.connectionNeeds,
      cameras: cameras.identified,
      pushing: pushing.identified,
      plugins: this.plugins,
      announcements: this.announcements,
      networks,
      webrtcPort,
    }).map((opening) => ({
      ...opening,
      deviceIds: [...opening.deviceIds],
      pluginIds: [...opening.pluginIds],
      state: probe.stateOf(opening.rule),
    }));
    const lowPorts = await lowPortsOf(
      system,
      this.plugins.map((need) => need.port),
    );
    const unlearned = unlearnedOf(cameras.unlearned, pushing.unlearned);
    const checked = {
      probe,
      openings,
      lowPorts,
      unlearned,
      checkedAt: this.options.now().toISOString(),
    };
    this.checked = checked;
    this.follow(probe.watch);
    log.info('firewall.checked', {
      backend: probe.backend,
      missing: openings.filter((opening) => opening.state !== 'open').length,
      unlearned: unlearned.length,
    });
    return this.publish(checked);
  }

  private async learnMacs(): Promise<ReadonlyMap<string, string>> {
    const { system, macs, log } = this.options;
    const known = new Map(macs.all());
    const waiting = [...this.cameras, ...this.pushing].filter(
      (device) => !known.has(device.deviceId),
    );
    if (waiting.length === 0) {
      return known;
    }
    const neighbors = await neighborMacs(system).catch((cause: unknown) => {
      log.warn('firewall.neighbors_unreadable', { reason: messageOf(cause) });
      return new Map<string, string>();
    });
    for (const device of waiting) {
      const mac = neighbors.get(device.address);
      if (mac !== undefined) {
        macs.remember(device.deviceId, mac);
        known.set(device.deviceId, mac);
        log.info('firewall.mac_learned', { deviceId: device.deviceId });
      }
    }
    return known;
  }

  private needsNetworks(): boolean {
    return this.plugins.length > 0 || this.announcements.length > 0;
  }

  private warnNoLan(networks: readonly string[]): void {
    if (!this.needsNetworks() || networks.length > 0 || this.warnedNoLan) {
      return;
    }
    this.warnedNoLan = true;
    this.options.log.warn('firewall.no_lan_network', {
      reason:
        'no private IPv4 network on the default route; plugin and announcement ports get no opening',
    });
  }

  private follow(paths: readonly string[]): void {
    for (const [path, close] of this.watchers) {
      if (!paths.includes(path)) {
        close();
        this.watchers.delete(path);
      }
    }
    for (const path of paths.filter((candidate) => !this.watchers.has(candidate))) {
      const close = this.options.system.watch(path, () => {
        this.recheck();
      });
      if (close !== null) {
        this.watchers.set(path, close);
      }
    }
  }

  private republish(): void {
    if (this.checked !== null) {
      this.publish(this.checked);
    }
  }

  private publish(checked: Checked): FirewallStatus {
    const status = this.statusOf(checked);
    const text = JSON.stringify(status);
    if (text !== this.last) {
      this.last = text;
      for (const listener of this.listeners) {
        listener(status);
      }
    }
    return status;
  }

  private statusOf(checked: Checked): FirewallStatus {
    const { probe, openings } = checked;
    const needed = openings.filter(
      (opening) => opening.state !== 'open' && probe.fixable.has(opening.state),
    );
    const fixes =
      probe.draft === null ? null : probe.draft({ needed, openings, unlearned: checked.unlearned });
    const draft = withLowPorts(fixes, checked.lowPorts);
    return {
      checkedAt: checked.checkedAt,
      backend: probe.backend,
      filtering: probe.filtering,
      detail: probe.detail,
      openings: [...openings],
      plan: draft === null ? null : revisionOf(draft),
      cameras: [...this.reach(openings), ...this.unlearnedReach(checked.unlearned)],
      unlearned: [...checked.unlearned],
      lowPorts: checked.lowPorts,
    };
  }

  private unlearnedReach(unlearned: readonly UnlearnedDevice[]): CameraReach[] {
    return unlearned
      .filter((device) => device.purpose === 'camera')
      .map((device) => ({
        deviceId: device.deviceId,
        mac: null,
        address: device.address,
        state: 'unknown',
        failedAt: this.failures.get(device.deviceId) ?? null,
      }));
  }

  private reach(openings: readonly FirewallOpening[]): CameraReach[] {
    return openings.flatMap((opening) => {
      const rule = opening.rule;
      if (rule.purpose !== 'camera') {
        return [];
      }
      return opening.deviceIds.map((deviceId) => {
        const failedAt = this.failures.get(deviceId) ?? null;
        return {
          deviceId,
          mac: rule.mac,
          address: rule.address,
          state: reachOf(opening.state, failedAt),
          failedAt,
        };
      });
    });
  }
}
