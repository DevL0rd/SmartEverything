import type { Href } from 'expo-router';
import {
  CAPABILITY_CATALOGUE,
  isCamera,
  isStandardCapability,
  privacySwitchOf,
  type PresentedCapability,
  type SearchEntry,
} from '@smarteverything/domain';
import { href } from '../app-shell/hrefs';
import type { IconName } from '../components/icon';
import { deviceModelOf } from '../features/devices';
import { sectionHref, sectionsOf } from '../features/devices/detail/sections';
import {
  DEVICE_PAGE_TITLES,
  devicePlaces,
  type DevicePage,
  type DevicePlace,
} from './device-places';
import type { NamedDevice, SourceLinks } from './sources';

export interface DeviceControl {
  readonly deviceId: string;
  readonly presented: PresentedCapability;
}

export interface DeviceSources {
  readonly entries: SearchEntry[];
  readonly controls: Map<string, DeviceControl>;
}

const SETTINGS_WORDS: readonly string[] = [
  'name',
  'rename',
  'room',
  'favourite',
  'show on home',
  'hide',
  'remove',
  'delete',
  'about',
  'model',
  'firmware',
];

interface Item {
  readonly id: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly parent: string;
  readonly link: Href;
  readonly icon: IconName;
}

function deviceKey(deviceId: string): string {
  return `device:${deviceId}`;
}

function entryOf(item: Item, named: NamedDevice, group: SearchEntry['group']): SearchEntry {
  return {
    id: item.id,
    group,
    title: item.title,
    detail: '',
    keywords: item.keywords,
    state: null,
    run: null,
    runLabel: null,
    open: { kind: 'device', deviceId: named.device.id },
    openLabel: 'Open',
    suggested: false,
  };
}

interface Builder {
  readonly named: NamedDevice;
  readonly out: SourceLinks;
  readonly sources: DeviceSources;
}

function add(builder: Builder, item: Item, group: SearchEntry['group']): void {
  builder.sources.entries.push(entryOf(item, builder.named, group));
  builder.out.links.set(item.id, item.link);
  builder.out.icons.set(item.id, item.icon);
  builder.out.parents.set(item.id, item.parent);
}

interface PageLink {
  readonly id: string;
  readonly link: Href;
  readonly icon: IconName;
}

function pageLinks(named: NamedDevice): Readonly<Record<DevicePage, PageLink>> {
  const id = named.device.id;
  const page = (key: string): string => `devpage:${id}:${key}`;
  return {
    overview: { id: deviceKey(id), link: href.device(named.device), icon: 'info' },
    controls: { id: page('controls'), link: sectionHref(id, 'controls'), icon: 'customize' },
    settings: { id: page('settings'), link: href.settings.device(id), icon: 'settings' },
    camera: { id: page('camera'), link: href.settings.camera(id), icon: 'cameras' },
    diagnostics: {
      id: page('diagnostics'),
      link: href.settings.device(id, 'diagnostics'),
      icon: 'info',
    },
  };
}

function addPages(builder: Builder, places: readonly DevicePlace[]): void {
  const { named } = builder;
  const links = pageLinks(named);
  const parent = deviceKey(named.device.id);
  for (const section of sectionsOf(deviceModelOf(named.device))) {
    if (section.key !== 'overview' && section.key !== 'controls') {
      const id = `devpage:${named.device.id}:${section.key}`;
      const link = sectionHref(named.device.id, section.key);
      add(
        builder,
        { id, title: section.title, keywords: [], parent, link, icon: section.icon },
        'page',
      );
    }
  }
  const pages = new Set(places.map((place) => place.page));
  pages.add('settings');
  if (isCamera(named.device)) {
    pages.add('camera');
  }
  for (const page of pages) {
    const link = links[page];
    const keywords = page === 'settings' ? SETTINGS_WORDS : [];
    if (page !== 'overview') {
      add(builder, { ...link, title: DEVICE_PAGE_TITLES[page], keywords, parent }, 'page');
    }
  }
}

const PRIVACY_WORDS: readonly string[] = ['privacy', 'private', 'camera off', 'sleep'];

function privacyWords(named: NamedDevice, presented: PresentedCapability): readonly string[] {
  const privacy = isCamera(named.device) ? privacySwitchOf(named.device) : null;
  return privacy?.key === presented.key ? PRIVACY_WORDS : [];
}

function controlWords(named: NamedDevice, presented: PresentedCapability): readonly string[] {
  const catalogued = isStandardCapability(presented.key)
    ? CAPABILITY_CATALOGUE[presented.key].keywords
    : [];
  return [
    presented.capability.label,
    presented.key.replaceAll('_', ' '),
    presented.groupLabel,
    ...catalogued,
    ...presented.options.map((option) => option.label),
    ...privacyWords(named, presented),
  ];
}

function addPlace(builder: Builder, place: DevicePlace): void {
  const { named } = builder;
  const page = pageLinks(named)[place.page];
  const id =
    place.title === '' ? page.id : `devsec:${named.device.id}:${place.page}:${place.title}`;
  if (place.title !== '') {
    add(
      builder,
      { id, title: place.title, keywords: [], parent: page.id, link: page.link, icon: page.icon },
      'page',
    );
  }
  for (const presented of place.capabilities) {
    const control = `capability:${named.device.id}:${presented.key}`;
    builder.sources.controls.set(control, { deviceId: named.device.id, presented });
    const keywords = controlWords(named, presented);
    add(
      builder,
      {
        id: control,
        title: presented.label,
        keywords,
        parent: id,
        link: page.link,
        icon: page.icon,
      },
      'action',
    );
  }
}

export function deviceSources(named: readonly NamedDevice[], out: SourceLinks): DeviceSources {
  const sources: DeviceSources = { entries: [], controls: new Map() };
  for (const device of named) {
    const builder: Builder = { named: device, out, sources };
    const places = devicePlaces(device.device);
    addPages(builder, places);
    for (const place of places) {
      addPlace(builder, place);
    }
  }
  return sources;
}
