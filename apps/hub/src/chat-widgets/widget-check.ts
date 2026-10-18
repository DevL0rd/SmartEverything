import { isCamera, type ChatWidget, type HealthMetric } from '@smarteverything/domain';
import { StoreNotFoundError } from '../store/context';
import type { Store } from '../store/store';
import { boardTypes } from './boards';
import { DAY_MS } from '../metrics/minute';

const HEALTH_LOOKBACK_DAYS = 30;
const MACROS: readonly HealthMetric[] = ['protein', 'carbohydrate', 'fat'];

export interface WidgetViewer {
  readonly profileId: string;
  readonly now: number;
}

function dayOf(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
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
  { readonly kind: 'page_link' | 'device' | 'camera' }
>;

type Exists = (store: Store, id: string) => boolean;

function listed(rows: (store: Store) => readonly { readonly id: string }[]): Exists {
  return (store, id) => rows(store).some((row) => row.id === id);
}

const EXISTS: Readonly<Record<IdWidget['kind'], Exists>> = {
  device_settings_link: (store, id) => store.devices.find(id) !== undefined,
  remote: listed((store) => store.infrared.remotes()),
  automation_link: (store, id) => store.automations.find(id) !== undefined,
  scene_link: listed((store) => store.scenes.list()),
  room_link: listed((store) => store.rooms.list()),
  scheduled_link: listed((store) => store.schedules.list()),
};

function isRowWidget(widget: ChatWidget): widget is IdWidget {
  return widget.kind in EXISTS;
}

function deviceReason(
  store: Store,
  widget: Extract<ChatWidget, { kind: 'device' | 'camera' }>,
): string | null {
  const device = store.devices.find(widget.id);
  if (device === undefined || device.hidden) {
    return `There is no device ${widget.id}`;
  }
  if (isCamera(device) !== (widget.kind === 'camera')) {
    return `${device.name} is ${isCamera(device) ? 'a camera: use kind camera' : 'not a camera: use kind device'}`;
  }
  return null;
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

function boardReason(store: Store, type: string): string | null {
  const shown = boardTypes(store);
  return shown.includes(type)
    ? null
    : `There is no board ${type}; boards of enabled plugins: ${shown.join(', ') || 'none'}`;
}

function dataReason(store: Store, widget: ChatWidget, viewer: WidgetViewer): string | null {
  if (widget.kind === 'health') {
    return hasDaily(store, viewer, [widget.metric], HEALTH_LOOKBACK_DAYS)
      ? null
      : `There is no ${widget.metric} data in the last ${String(HEALTH_LOOKBACK_DAYS)} days`;
  }
  if (widget.kind === 'nutrition') {
    return widget.part !== 'macros' || hasDaily(store, viewer, MACROS, 0)
      ? null
      : 'No macros are logged today';
  }
  if (widget.kind === 'scenes') {
    return store.scenes.list().length > 0 ? null : 'There are no scenes';
  }
  return null;
}

function targetReason(store: Store, widget: ChatWidget): string | null {
  if (widget.kind === 'board') {
    return boardReason(store, widget.type);
  }
  if (widget.kind === 'page_link' && !pageKnown(store, widget)) {
    return `There is no ${widget.page} page ${widget.id ?? ''}`.trim();
  }
  return null;
}

export function widgetRejection(
  store: Store,
  widget: ChatWidget,
  viewer: WidgetViewer,
): string | null {
  if (widget.kind === 'device' || widget.kind === 'camera') {
    return deviceReason(store, widget);
  }
  if (isRowWidget(widget)) {
    return EXISTS[widget.kind](store, widget.id)
      ? null
      : `There is no ${widget.kind.replace('_link', '').replaceAll('_', ' ')} ${widget.id}`;
  }
  return targetReason(store, widget) ?? dataReason(store, widget, viewer);
}
