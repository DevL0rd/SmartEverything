import type { DesktopServer } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { app, powerMonitor } from 'electron';
import { join } from 'node:path';
import { systemRingClock } from './ring-clock.js';
import { RingActions } from './ring-actions.js';
import type { HubNetworkRegistration } from '../hub-network/ipc.js';
import type { ServiceController } from '../service/controller.js';
import { desktopHubFetch } from '../updates/update-fetch.js';
import { RingHub, type RingHubRoute } from './ring-hub.js';
import { electronRingNotifier } from './ring-notifier.js';
import { RingNoticeWatch } from './ring-notices.js';
import { RingScheduler } from './ring-scheduler.js';
import { RingSoundCache } from './ring-sounds.js';
import { RingSync } from './ring-sync.js';
import type { RingOutcomes, RingSurface } from './ring-types.js';
import { RingWindows } from './ring-window.js';

function registerPlannerRing(outcomes: RingOutcomes, surface: RingSurface): RingScheduler {
  const scheduler = new RingScheduler({
    clock: systemRingClock,
    surface,
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
  const folder = join(app.getPath('userData'), 'planner-ring');
  const sounds = new RingSoundCache(join(folder, 'sounds'), (itemId) => hub.soundFile(itemId));
  const link: { sync: RingSync | null } = { sync: null };
  const actions = new RingActions(hub, {
    snoozed: (ring): void => {
      link.sync?.snoozed(ring);
    },
    settled: (ring): void => {
      link.sync?.settled(ring);
    },
  });
  const scheduler = registerPlannerRing(
    actions,
    new RingWindows({ pages: join(folder, 'pages'), sounds }),
  );
  const sync = new RingSync({
    hub,
    target: scheduler,
    clock: systemRingClock,
    sounds,
    remote: actions,
  });
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
