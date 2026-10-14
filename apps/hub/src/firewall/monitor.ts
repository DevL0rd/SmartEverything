import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type {
  CameraReach,
  FirewallOpening,
  FirewallPlan,
  FirewallStatus,
  LowPorts,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DeviceRecord } from '../database/port';
import { cameraSourceOf, pushSourceOf } from '../state/inventory';
import { lanNetworks } from './lan-networks';
import { probeLinux } from './linux';
import { lowPortsOf } from './low-ports';
import { probeMac } from './macos';
import {
  always,
  cameraAddressOf,
  requiredOpenings,
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

const PROBES: Readonly<Record<FirewallPlatform, Prober>> = {
  linux: probeLinux,
  darwin: probeMac,
  win32: probeWindows,
};

const UDP_TIMEOUT = /read udp .*i\/o timeout/;

export interface FirewallMonitorOptions {
  readonly system: FirewallSystem;
  readonly webrtcPort: number;
  readonly now: () => Date;
  readonly log: Logger;
}

export type FirewallListener = (status: FirewallStatus) => void;

interface Checked {
  readonly probe: Probe;
  readonly openings: readonly FirewallOpening[];
  readonly lowPorts: LowPorts | null;
  readonly checkedAt: string;
}

function failedProbe(cause: unknown): Probe {
  return {
    backend: 'unknown',
    filtering: null,
    detail: `The firewall could not be read: ${cause instanceof Error ? cause.message : String(cause)}`,
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

function camerasOf(devices: readonly DeviceRecord[], log: Logger): readonly DeviceAddress[] {
  return devices.flatMap((device) => {
    const source = cameraSourceOf(device);
    if (source === null) {
      return [];
    }
    const address = cameraAddressOf(source);
    if (address === null) {
      log.warn('firewall.camera_without_address', { deviceId: device.id });
      return [];
    }
    return [{ deviceId: device.id, address }];
  });
}

function pushingOf(devices: readonly DeviceRecord[], log: Logger): readonly DeviceAddress[] {
  return devices.flatMap((device) => {
    const address = pushSourceOf(device);
    if (address === null) {
      return [];
    }
    if (isIP(address) === 0) {
      log.warn('firewall.push_source_not_address', { deviceId: device.id });
      return [];
    }
    return [{ deviceId: device.id, address }];
  });
}

export class FirewallMonitor {
  private cameras: readonly DeviceAddress[] = [];
  private pushing: readonly DeviceAddress[] = [];
  private plugins: readonly PluginPortNeed[] = [];
  private devicesKey = '';
  private pluginsKey = '';
  private warnedNoLan = false;
  private checked: Checked | null = null;
  private readonly failures = new Map<string, string>();
  private readonly opening = new Map<string, number>();
  private readonly suspects = new Set<string>();
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
    const key = JSON.stringify({ cameras, pushing });
    if (key === this.devicesKey) {
      return;
    }
    this.cameras = cameras;
    this.pushing = pushing;
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

  streamOpening(deviceId: string): void {
    this.opening.set(deviceId, (this.opening.get(deviceId) ?? 0) + 1);
  }

  streamSettled(deviceId: string, succeeded: boolean): void {
    const remaining = (this.opening.get(deviceId) ?? 1) - 1;
    if (remaining > 0) {
      this.opening.set(deviceId, remaining);
    } else {
      this.opening.delete(deviceId);
    }
    if (!succeeded) {
      this.suspects.add(deviceId);
      return;
    }
    this.suspects.delete(deviceId);
    if (this.failures.delete(deviceId)) {
      this.republish();
    }
  }

  reported(text: string): void {
    if (!UDP_TIMEOUT.test(text)) {
      return;
    }
    const devices = new Set([...this.opening.keys(), ...this.suspects]);
    this.suspects.clear();
    if (devices.size === 0) {
      return;
    }
    const at = this.options.now().toISOString();
    for (const deviceId of devices) {
      this.failures.set(deviceId, at);
    }
    this.options.log.warn('firewall.camera_timed_out', { deviceIds: [...devices].join(',') });
    this.republish();
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
        reason: cause instanceof Error ? cause.message : String(cause),
      });
      return failedProbe(cause);
    });
    const networks = this.plugins.length === 0 ? [] : await lanNetworks(system.read);
    this.warnNoLan(networks);
    const needs = {
      connections: this.connectionNeeds,
      cameras: this.cameras,
      pushing: this.pushing,
      plugins: this.plugins,
      networks,
      webrtcPort,
    };
    const openings = requiredOpenings(needs).map((opening) => ({
      ...opening,
      deviceIds: [...opening.deviceIds],
      pluginIds: [...opening.pluginIds],
      state: probe.stateOf(opening.rule),
    }));
    const lowPorts = await lowPortsOf(
      system,
      this.plugins.map((need) => need.port),
    );
    const checked = { probe, openings, lowPorts, checkedAt: this.options.now().toISOString() };
    this.checked = checked;
    this.follow(probe.watch);
    log.info('firewall.checked', {
      backend: probe.backend,
      missing: openings.filter((opening) => opening.state !== 'open').length,
    });
    return this.publish(checked);
  }

  private warnNoLan(networks: readonly string[]): void {
    if (this.plugins.length === 0 || networks.length > 0 || this.warnedNoLan) {
      return;
    }
    this.warnedNoLan = true;
    this.options.log.warn('firewall.no_lan_network', {
      reason: 'no private IPv4 network on the default route; plugin ports get no opening',
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
    const fixes = needed.length === 0 || probe.draft === null ? null : probe.draft(needed);
    const draft = withLowPorts(fixes, checked.lowPorts);
    return {
      checkedAt: checked.checkedAt,
      backend: probe.backend,
      filtering: probe.filtering,
      detail: probe.detail,
      openings: [...openings],
      plan: draft === null ? null : revisionOf(draft),
      cameras: this.reach(openings),
      lowPorts: checked.lowPorts,
    };
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
          address: rule.source,
          state: reachOf(opening.state, failedAt),
          failedAt,
        };
      });
    });
  }
}
