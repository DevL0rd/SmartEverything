import { JSON_VALUE, type JsonValue, type VacuumPose } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import {
  ROUTE_ACTION,
  mergeRouteDelta,
  parseRouteDelta,
  routePose,
  vacuumAction,
  type Route,
} from '@smarteverything/xiaomi';
import { z } from 'zod';
import type { DeviceIo } from '../adapters/xiaomi/device-io';

export const ROUTE_INTERVAL_MS = 2000;

export const ROUTE_PAGE_SIZE = 10;

export const EMPTY_ROUTE: Route = { cursor: 0, points: [] };

const ACTION_OUTPUTS = z.array(z.object({ piid: z.number().int(), value: JSON_VALUE }));

export interface RouteIo {
  readonly transport: DeviceIo['transport'];
  readonly action: DeviceIo['action'];
}

export interface RouteTimer {
  readonly after: (ms: number, run: () => void) => () => void;
}

export const systemRouteTimer: RouteTimer = {
  after: (ms, run) => {
    const handle = setTimeout(run, ms);
    return (): void => {
      clearTimeout(handle);
    };
  },
};

export interface LiveRouteUpdate {
  readonly route: Route;
  readonly pose: VacuumPose | null;
}

export interface LiveRoutePorts {
  readonly io: (deviceId: string) => RouteIo | null;
  readonly timer: RouteTimer;
  readonly changed: (deviceId: string, update: LiveRouteUpdate) => void;
  readonly log: Logger;
}

export class RouteInputError extends Error {
  override readonly name = 'RouteInputError';

  constructor(readonly received: number) {
    super('The route request needs a non-negative integer pose id.');
  }
}

export function routeRequest(poseId: number): readonly JsonValue[] {
  if (!Number.isSafeInteger(poseId) || poseId < 0) throw new RouteInputError(poseId);
  return [{ piid: ROUTE_ACTION.piid, value: JSON.stringify({ pose_id: poseId }) }];
}

function routeAddress(): { readonly siid: number; readonly aiid: number } {
  const { siid, aiid } = vacuumAction('vacuum', 'get-vacuum-route');
  return { siid, aiid };
}

export function poseOf(route: Route): VacuumPose | null {
  return routePose(route, null);
}

class RouteSession {
  private held: Route = EMPTY_ROUTE;
  private on = false;
  private busy = false;
  private broken = false;
  private epoch = 0;
  private timer: (() => void) | null = null;

  get route(): Route {
    return this.held;
  }

  get running(): boolean {
    return this.on;
  }

  get inFlight(): boolean {
    return this.busy;
  }

  get generation(): number {
    return this.epoch;
  }

  run(): boolean {
    const changed = !this.on;
    this.on = true;
    return changed;
  }

  halt(): boolean {
    const changed = this.on;
    this.on = false;
    this.disarm();
    return changed;
  }

  clear(): boolean {
    const hadPoints = this.held.points.length > 0;
    this.held = EMPTY_ROUTE;
    this.epoch += 1;
    return hadPoints;
  }

  adopt(route: Route): void {
    this.held = route;
  }

  flight(busy: boolean): void {
    this.busy = busy;
  }

  arm(cancel: () => void): void {
    this.timer = cancel;
  }

  disarm(): void {
    this.timer?.();
    this.timer = null;
  }

  fail(): boolean {
    const first = !this.broken;
    this.broken = true;
    return first;
  }

  recover(): boolean {
    const was = this.broken;
    this.broken = false;
    return was;
  }
}

export class VacuumLiveRoute {
  private readonly sessions = new Map<string, RouteSession>();

  constructor(private readonly ports: LiveRoutePorts) {}

  active(deviceId: string): boolean {
    return this.sessions.get(deviceId)?.running === true;
  }

  route(deviceId: string): Route | null {
    const route = this.sessions.get(deviceId)?.route;
    return route === undefined || route.points.length === 0 ? null : route;
  }

  start(deviceId: string): void {
    const session = this.sessionOf(deviceId);
    if (!session.run()) return;
    this.ports.log.info('vacuum_route.started', { deviceId, cursor: session.route.cursor });
    if (!session.inFlight) this.schedule(deviceId, session);
  }

  stop(deviceId: string): void {
    const session = this.sessions.get(deviceId);
    if (session?.halt() !== true) return;
    this.ports.log.info('vacuum_route.stopped', { deviceId, cursor: session.route.cursor });
  }

  reset(deviceId: string): void {
    if (this.sessionOf(deviceId).clear()) {
      this.ports.changed(deviceId, { route: EMPTY_ROUTE, pose: null });
    }
  }

  private sessionOf(deviceId: string): RouteSession {
    const held = this.sessions.get(deviceId);
    if (held !== undefined) return held;
    const created = new RouteSession();
    this.sessions.set(deviceId, created);
    return created;
  }

  private schedule(deviceId: string, session: RouteSession): void {
    session.arm(
      this.ports.timer.after(ROUTE_INTERVAL_MS, () => {
        background(this.tick(deviceId, session), 'vacuum_route.tick_failed', { deviceId });
      }),
    );
  }

  private async tick(deviceId: string, session: RouteSession): Promise<void> {
    session.disarm();
    if (!session.running) return;
    const io = this.ports.io(deviceId);
    if (io?.transport !== 'lan') {
      session.halt();
      this.ports.log.info('vacuum_route.no_lan', { deviceId });
      return;
    }
    session.flight(true);
    try {
      await this.drain(deviceId, session, io);
    } finally {
      session.flight(false);
    }
    this.rearm(deviceId, session);
  }

  private rearm(deviceId: string, session: RouteSession): void {
    if (session.running) this.schedule(deviceId, session);
  }

  private async drain(deviceId: string, session: RouteSession, io: RouteIo): Promise<void> {
    let more = true;
    while (more && session.running) {
      more = await this.page(deviceId, session, io);
    }
  }

  private async page(deviceId: string, session: RouteSession, io: RouteIo): Promise<boolean> {
    const generation = session.generation;
    try {
      const outputs = ACTION_OUTPUTS.parse(
        await io.action(routeAddress(), routeRequest(session.route.cursor)),
      );
      const points = parseRouteDelta(outputs);
      if (generation !== session.generation || !session.running) return false;
      if (session.recover()) this.ports.log.info('vacuum_route.recovered', { deviceId });
      return this.merge(deviceId, session, points);
    } catch (error) {
      this.failed(deviceId, session, error);
      return false;
    }
  }

  private merge(
    deviceId: string,
    session: RouteSession,
    points: Parameters<typeof mergeRouteDelta>[1],
  ): boolean {
    const merged = mergeRouteDelta(session.route, points);
    if (merged.gap) {
      this.ports.log.warn('vacuum_route.gap', { deviceId, cursor: session.route.cursor });
      session.clear();
      return false;
    }
    if (merged.appended === 0) return false;
    session.adopt(merged.route);
    this.ports.changed(deviceId, { route: merged.route, pose: poseOf(merged.route) });
    return merged.appended >= ROUTE_PAGE_SIZE;
  }

  private failed(deviceId: string, session: RouteSession, error: unknown): void {
    if (!session.fail()) return;
    this.ports.log.error('vacuum_route.failed', undefined, {
      deviceId,
      cursor: session.route.cursor,
      reason: error instanceof Error ? error.name : typeof error,
    });
  }
}
