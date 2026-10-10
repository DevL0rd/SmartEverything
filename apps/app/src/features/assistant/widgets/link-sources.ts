import type { Href } from 'expo-router';
import type { ChatLink } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { IconName } from '../../../components/icon';
import { visibleSettings } from '../../../settings/registry';
import { breadcrumbOf, settingsPage } from '../../../settings/tree';
import type { SettingDefinition, SettingEnv, SwitchSetting } from '../../../settings/types';
import type { StoreState } from '../../../store/state';
import { pageLinkView } from './page-links';

export interface LinkView {
  readonly key: string;
  readonly specific: boolean;
  readonly icon: IconName;
  readonly title: string;
  readonly trail: string;
  readonly value: string | null;
  readonly href: Href;
  readonly toggle: SwitchSetting | null;
}

function trailOf(pageId: string, includeSelf: boolean): string {
  const titles = breadcrumbOf(pageId)
    .filter((page) => includeSelf || page.id !== pageId)
    .map((page) => page.title);
  return titles.length === 0 ? 'Settings' : titles.join(' › ');
}

function formatted(row: SettingDefinition, value: string | null): string | null {
  const number = Number(value);
  if (value === null || !Number.isFinite(number)) {
    return value;
  }
  if (row.control === 'stepper') {
    return row.format?.(number) ?? [value, row.unit].filter((part) => part !== undefined).join(' ');
  }
  return row.control === 'select'
    ? (row.options.find((option) => option.value === value)?.label ?? value)
    : value;
}

function settingLink(setting: string, value: string | null, env: SettingEnv): LinkView | null {
  const page = settingsPage(setting);
  if (page !== undefined) {
    return {
      key: `page:${setting}`,
      specific: false,
      icon: page.icon,
      title: page.title,
      trail: trailOf(setting, false),
      value,
      href: href.settings.page(setting),
      toggle: null,
    };
  }
  const row = visibleSettings(env).find((candidate) => candidate.id === setting);
  const parent = row === undefined ? undefined : settingsPage(row.page);
  if (row === undefined || parent === undefined) {
    return null;
  }
  return {
    key: `setting:${row.id}`,
    specific: true,
    icon: row.icon ?? parent.icon,
    title: row.title,
    trail: trailOf(parent.id, true),
    value: formatted(row, value),
    href: href.settings.focus(parent.id, row.id),
    toggle: row.control === 'switch' ? row : null,
  };
}

type Tables = StoreState['tables'];

function named<T extends { readonly id: string }>(
  rows: Readonly<Record<string, T | undefined>>,
  id: string,
  name: (row: T) => string,
): string | null {
  const row = rows[id];
  return row === undefined ? null : name(row);
}

type EntityLink = Exclude<ChatLink, { kind: 'setting_link' | 'page_link' }>;

interface EntityKind {
  readonly icon: IconName;
  readonly trail: string;
  readonly title: (tables: Tables, id: string) => string | null;
  readonly to: (id: string) => Href;
}

const ENTITIES: Readonly<Record<EntityLink['kind'], EntityKind>> = {
  device_settings_link: {
    icon: 'settings',
    trail: 'Device settings',
    title: (tables, id) => named(tables.devices.byId, id, (row) => row.label),
    to: (id) => href.settings.device(id),
  },
  automation_link: {
    icon: 'automations',
    trail: 'Automation',
    title: (tables, id) => named(tables.automations.byId, id, (row) => row.name),
    to: (id) => href.automation(id),
  },
  scene_link: {
    icon: 'sparkles',
    trail: 'Scene',
    title: (tables, id) => named(tables.scenes.byId, id, (row) => row.name),
    to: (id) => href.scene(id),
  },
  room_link: {
    icon: 'grid',
    trail: 'Room',
    title: (tables, id) => named(tables.rooms.byId, id, (row) => row.name),
    to: (id) => href.room(id),
  },
  scheduled_link: {
    icon: 'timer',
    trail: 'Scheduled',
    title: (tables, id) =>
      named(tables.scheduled_actions.byId, id, (row) => row.label ?? 'Scheduled action'),
    to: (id) => href.scheduledItem(id),
  },
};

function entityLink(link: EntityLink, tables: Tables): LinkView | null {
  const entity = ENTITIES[link.kind];
  const title = entity.title(tables, link.id);
  return title === null
    ? null
    : {
        key: `${link.kind}:${link.id}`,
        specific: true,
        icon: entity.icon,
        title,
        trail: entity.trail,
        value: link.value,
        href: entity.to(link.id),
        toggle: null,
      };
}

export function linkView(link: ChatLink, tables: Tables, env: SettingEnv): LinkView | null {
  if (link.kind === 'page_link') {
    return pageLinkView(link, tables);
  }
  return link.kind === 'setting_link'
    ? settingLink(link.setting, link.value, env)
    : entityLink(link, tables);
}

export function mostSpecific(views: readonly LinkView[]): readonly LinkView[] {
  const specific = views.some((view) => view.specific);
  return views.filter((view) => view.specific || !specific);
}
