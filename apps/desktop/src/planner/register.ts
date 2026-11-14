import type { DesktopServer } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { powerMonitor } from 'electron';
import { systemRingClock } from './ring-clock.js';
import { RingActions } from './ring-actions.js';
import type { HubNetworkRegistration } from '../hub-network/ipc.js';
import type { ServiceController } from '../service/controller.js';
import { desktopHubFetch } from '../updates/update-fetch.js';
import { RingHub, type RingHubRoute } from './ring-hub.js';
import { electronRingNotifier } from './ring-notifier.js';
import { RingNoticeWatch } from './ring-notices.js';
import { RingScheduler } from './ring-scheduler.js';
import { RingSync } from './ring-sync.js';
import type { RingOutcomes } from './ring-types.js';
import { RingWindows } from './ring-window.js';

export function registerPlannerRing(outcomes: RingOutcomes): RingScheduler {
  const scheduler = new RingScheduler({
    clock: systemRingClock,
    surface: new RingWindows(),
    notifier: electronRingNotifier,
    outcomes,
  });
  powerMonitor.on('suspend', () => {
    scheduler.suspend();
  });
  powerMonitor.on('resume', () => {
    scheduler.resume();
  });
  return scheduler;
}

export function startPlannerRings(
  controller: ServiceController,
  network: Pick<HubNetworkRegistration, 'updateLease' | 'onRouteReady'>,
): void {
  const server = (): Promise<DesktopServer | null> => controller.server();
  const route: RingHubRoute = { server, lease: network.updateLease };
  const hub = new RingHub({ server, fetch: desktopHubFetch(server, network.updateLease) });
  const link: { sync: RingSync | null } = { sync: null };
  const actions = new RingActions(hub, {
    snoozed: (ring): void => {
      link.sync?.snoozed(ring);
    },
    settled: (ring): void => {
      link.sync?.settled(ring);
    },
  });
  const scheduler = registerPlannerRing(actions);
  const sync = new RingSync(hub, scheduler, systemRingClock);
  link.sync = sync;
  const watch = new RingNoticeWatch(route, () => {
    sync.request();
  });
  powerMonitor.on('resume', () => {
    sync.request();
  });
  network.onRouteReady(() => {
    sync.request();
    background(watch.connect(), 'planner_ring.notice_connect_failed');
  });
}
