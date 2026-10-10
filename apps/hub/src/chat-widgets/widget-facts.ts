import { isCamera, type ChatWidget, type HealthMetric } from '@smarteverything/domain';
import { StoreNotFoundError } from '../store/context';
import type { Store } from '../store/store';
import type { WidgetFacts } from './rule-input';

export function widgetFactsOf(store: Store): WidgetFacts {
  return {
    deviceWidget: (deviceId: string): ChatWidget | null => {
      const device = store.devices.list().find((candidate) => candidate.id === deviceId);
      if (device === undefined || device.hidden) {
        return null;
      }
      return { kind: isCamera(device) ? 'camera' : 'device', id: device.id };
    },
    pluginIds: (): readonly string[] =>
      store.plugins
        .list()
        .filter((plugin) => plugin.enabled)
        .map((plugin) => plugin.id),
    remoteId: (remote: string): string | null => {
      const wanted = remote.trim().toLowerCase();
      const found = store.infrared
        .remotes()
        .filter((row) => row.id === remote || row.name.toLowerCase() === wanted);
      return found.length === 1 && found[0] !== undefined ? found[0].id : null;
    },
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HEALTH_LOOKBACK_DAYS = 30;
const MACROS: readonly HealthMetric[] = ['protein', 'carbohydrate', 'fat'];

function dayOf(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export interface WidgetViewer {
  readonly profileId: string;
  readonly now: number;
}

function hasDaily(
  store: Store,
  viewer: WidgetViewer,
  metrics: readonly HealthMetric[],
  days: number,
): boolean {
  const zone = store.settings.read().time_zone;
  const from = dayOf(viewer.now - days * DAY_MS, zone);
  const to = dayOf(viewer.now, zone);
  return store.health.dailyRange(viewer.profileId, from, to, metrics).length > 0;
}

type IdWidget = Exclude<
  Extract<ChatWidget, { readonly id: unknown }>,
  { readonly kind: 'page_link' }
>;

type Rows = (store: Store) => readonly { readonly id: string }[];

const ROWS: Readonly<Record<IdWidget['kind'], Rows>> = {
  device: (store) => store.devices.list(),
  camera: (store) => store.devices.list(),
  device_settings_link: (store) => store.devices.list(),
  remote: (store) => store.infrared.remotes(),
  automation_link: (store) => store.automations.list(),
  scene_link: (store) => store.scenes.list(),
  room_link: (store) => store.rooms.list(),
  scheduled_link: (store) => store.schedules.list(),
};

function isIdWidget(widget: ChatWidget): widget is IdWidget {
  return 'id' in widget && widget.kind !== 'page_link';
}

function chatExists(store: Store, id: string): boolean {
  try {
    return store.aiChats.chat(id).archived_at === null;
  } catch (cause) {
    if (cause instanceof StoreNotFoundError) {
      return false;
    }
    throw cause;
  }
}

function pageKnown(store: Store, link: Extract<ChatWidget, { kind: 'page_link' }>): boolean {
  const { id } = link;
  switch (link.page) {
    case 'costs':
      return true;
    case 'chat':
      return id === null || chatExists(store, id);
    case 'plugin':
      return store.plugins.list().some((plugin) => plugin.id === id);
    case 'person':
      return store.profiles.list().some((profile) => profile.id === id);
  }
}

export function knownWidget(store: Store, widget: ChatWidget, viewer: WidgetViewer): boolean {
  if (isIdWidget(widget)) {
    return ROWS[widget.kind](store).some((row) => row.id === widget.id);
  }
  switch (widget.kind) {
    case 'health':
      return hasDaily(store, viewer, [widget.metric], HEALTH_LOOKBACK_DAYS);
    case 'nutrition':
      return widget.part !== 'macros' || hasDaily(store, viewer, MACROS, 0);
    case 'scenes':
      return store.scenes.list().length > 0;
    case 'weather':
    case 'setting_link':
    case 'board':
      return true;
    case 'page_link':
      return pageKnown(store, widget);
  }
}
