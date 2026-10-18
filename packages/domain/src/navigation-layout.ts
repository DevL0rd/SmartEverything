import { z } from 'zod';
import type { ChatLink } from './chat-widgets';
import type { SearchTarget } from './search';

export const NAV_SECTIONS = [
  'home',
  'devices',
  'cameras',
  'fitness',
  'assistant',
  'talk',
  'automations',
] as const;

export type NavSection = (typeof NAV_SECTIONS)[number];

export const NAV_HIDDEN_CHOICES = NAV_SECTIONS.filter(
  (section): section is Exclude<NavSection, 'assistant'> => section !== 'assistant',
);

export const NAV_ICONS = [
  'home',
  'bulb',
  'cameras',
  'fitness',
  'sparkles',
  'radio',
  'automations',
  'folder',
  'star',
  'bed',
  'sofa',
  'utensils',
  'bath',
  'car',
  'plug',
  'fan',
  'thermometer',
  'lock',
  'door',
  'tv',
  'music',
  'heartPulse',
  'moon',
  'sun',
  'leaf',
  'gauge',
  'messageCircle',
  'user',
  'settings',
  'play',
] as const;

export type NavIcon = (typeof NAV_ICONS)[number];

export const NAV_BAR_SLOTS = 4;

export const NAV_TITLE_MAX = 40;

const NAV_ID = z.string().min(1).max(40);

const FOCUS = z.string().min(1).max(120).nullable();

export const NAV_PIN_TARGET = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('section'), section: z.enum(NAV_SECTIONS) }),
  z.strictObject({
    kind: z.literal('page'),
    path: z
      .string()
      .min(1)
      .max(200)
      .describe('A page of the app by route key, for example fitness-sleep, devices-air or automations.scenes'),
  }),
  z.strictObject({
    kind: z.literal('setting'),
    page: z
      .string()
      .min(1)
      .max(200)
      .describe('A settings page id such as appearance/navigation, or the id of one setting'),
    setting: z.string().min(1).max(120).nullable(),
  }),
  z.strictObject({ kind: z.literal('device'), deviceId: z.uuid(), focus: FOCUS }),
  z.strictObject({ kind: z.literal('camera'), deviceId: z.uuid() }),
  z.strictObject({ kind: z.literal('room'), roomId: z.uuid() }),
  z.strictObject({ kind: z.literal('group'), groupId: z.uuid() }),
  z.strictObject({ kind: z.literal('scene'), sceneId: z.uuid() }),
  z.strictObject({ kind: z.literal('automation'), automationId: z.uuid(), focus: FOCUS }),
  z.strictObject({ kind: z.literal('chat'), chatId: z.uuid() }),
]);

export type NavPinTarget = z.infer<typeof NAV_PIN_TARGET>;

export const NAV_TARGET = z.discriminatedUnion('kind', [
  ...NAV_PIN_TARGET.options,
  z.strictObject({
    kind: z.literal('nav'),
    node: NAV_ID.describe('The id of a navigation item, to point at it without opening anything'),
  }),
]);

export type NavTarget = z.infer<typeof NAV_TARGET>;

export const NAV_SECTION_NODE = z.strictObject({
  kind: z.literal('section'),
  section: z.enum(NAV_SECTIONS),
});

export type NavSectionNode = z.infer<typeof NAV_SECTION_NODE>;

export const NAV_PIN = z.strictObject({
  kind: z.literal('pin'),
  id: NAV_ID,
  target: NAV_PIN_TARGET,
  title: z
    .string()
    .min(1)
    .max(NAV_TITLE_MAX)
    .nullable()
    .describe('The person’s own name for the pin; null shows the live name of what it points at'),
  icon: z.enum(NAV_ICONS).nullable(),
});

export type NavPin = z.infer<typeof NAV_PIN>;

export const NAV_ENTRY = z.discriminatedUnion('kind', [NAV_SECTION_NODE, NAV_PIN]);

export type NavEntry = z.infer<typeof NAV_ENTRY>;

export const NAV_FOLDER = z.strictObject({
  kind: z.literal('folder'),
  id: NAV_ID,
  title: z.string().min(1).max(NAV_TITLE_MAX),
  icon: z.enum(NAV_ICONS),
  items: z.array(NAV_ENTRY),
});

export type NavFolder = z.infer<typeof NAV_FOLDER>;

export const NAV_NODE = z.discriminatedUnion('kind', [NAV_SECTION_NODE, NAV_PIN, NAV_FOLDER]);

export type NavNode = z.infer<typeof NAV_NODE>;

export function navNodeKey(node: NavNode): string {
  return node.kind === 'section' ? `section:${node.section}` : node.id;
}

function repeatedKeys(items: readonly NavNode[]): readonly string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const node of items) {
    const members = node.kind === 'folder' ? node.items.map(navNodeKey) : [];
    for (const key of [navNodeKey(node), ...members]) {
      if (seen.has(key)) repeated.add(key);
      seen.add(key);
    }
  }
  return [...repeated];
}

export const NAVIGATION_LAYOUT = z
  .strictObject({
    items: z
      .array(NAV_NODE)
      .nullable()
      .describe(
        'Everything in the navigation in order: sections, pins and folders (one level). The first four that are not the Assistant sit in the phone bar. null is the default order',
      ),
    hidden: z
      .array(z.enum(NAV_HIDDEN_CHOICES))
      .describe('Sections taken out of the navigation; the person can always show them again'),
  })
  .refine((layout) => layout.items === null || repeatedKeys(layout.items).length === 0, {
    message: 'A section or an id appears twice in the navigation',
  });

export type NavigationLayout = z.infer<typeof NAVIGATION_LAYOUT>;

export const DEFAULT_NAVIGATION_LAYOUT: NavigationLayout = { items: null, hidden: [] };

export const NAVIGATION_DEVICE_PREF = z.strictObject({
  override: NAVIGATION_LAYOUT.nullable().describe(
    'This device’s own layout; null follows the layout synced to all of the person’s devices',
  ),
});

export type NavigationDevicePref = z.infer<typeof NAVIGATION_DEVICE_PREF>;

export interface NavAvailability {
  readonly section: (section: NavSection) => boolean;
  readonly exists: (target: NavPinTarget) => boolean;
}

export type ResolvedEntry =
  | { readonly kind: 'section'; readonly key: string; readonly section: NavSection }
  | {
      readonly kind: 'pin';
      readonly key: string;
      readonly pin: NavPin;
      readonly missing: boolean;
    };

export type ResolvedNode =
  | ResolvedEntry
  | {
      readonly kind: 'folder';
      readonly key: string;
      readonly folder: NavFolder;
      readonly items: readonly ResolvedEntry[];
    };

export interface ResolvedNav {
  readonly nodes: readonly ResolvedNode[];
  readonly barSlots: readonly ResolvedNode[];
  readonly overflow: readonly ResolvedNode[];
  readonly hidden: readonly NavSection[];
  readonly duplicates: readonly NavSection[];
}

function isOrb(node: ResolvedNode): boolean {
  return node.kind === 'section' && node.section === 'assistant';
}

export function defaultNavigationItems(): readonly NavNode[] {
  return NAV_SECTIONS.map((section): NavNode => ({ kind: 'section', section }));
}

interface Walk {
  readonly layout: NavigationLayout;
  readonly availability: NavAvailability;
  readonly seen: Set<NavSection>;
  readonly duplicates: NavSection[];
}

function shown(walk: Walk, section: NavSection): boolean {
  return walk.availability.section(section) && !walk.layout.hidden.some((name) => name === section);
}

function entryOf(walk: Walk, entry: NavEntry): ResolvedEntry | null {
  if (entry.kind === 'pin') {
    return {
      kind: 'pin',
      key: entry.id,
      pin: entry,
      missing: !walk.availability.exists(entry.target),
    };
  }
  if (walk.seen.has(entry.section)) {
    walk.duplicates.push(entry.section);
    return null;
  }
  walk.seen.add(entry.section);
  return shown(walk, entry.section)
    ? { kind: 'section', key: navNodeKey(entry), section: entry.section }
    : null;
}

function nodeOf(walk: Walk, node: NavNode): ResolvedNode | null {
  if (node.kind !== 'folder') return entryOf(walk, node);
  const items = node.items.flatMap((entry) => entryOf(walk, entry) ?? []);
  return { kind: 'folder', key: node.id, folder: node, items };
}

export function resolveNavigation(
  layout: NavigationLayout,
  availability: NavAvailability,
): ResolvedNav {
  const walk: Walk = { layout, availability, seen: new Set(), duplicates: [] };
  const listed = (layout.items ?? defaultNavigationItems()).flatMap((node) => nodeOf(walk, node) ?? []);
  const appended = NAV_SECTIONS.filter(
    (section) => !walk.seen.has(section) && shown(walk, section),
  );
  const nodes = [
    ...listed,
    ...appended.map((section): ResolvedNode => ({
      kind: 'section',
      key: `section:${section}`,
      section,
    })),
  ];
  const outsideOrb = nodes.filter((node) => !isOrb(node));
  return {
    nodes,
    barSlots: outsideOrb.slice(0, NAV_BAR_SLOTS),
    overflow: outsideOrb.slice(NAV_BAR_SLOTS),
    hidden: NAV_SECTIONS.filter(
      (section) => availability.section(section) && layout.hidden.some((name) => name === section),
    ),
    duplicates: walk.duplicates,
  };
}

export function navTargetOfSearch(open: SearchTarget): NavPinTarget | null {
  switch (open.kind) {
    case 'page':
      return { kind: 'page', path: open.path };
    case 'device':
      return { kind: 'device', deviceId: open.deviceId, focus: null };
    case 'device-page':
      return { kind: 'device', deviceId: open.deviceId, focus: open.focus };
    case 'camera':
      return { kind: 'camera', deviceId: open.deviceId };
    case 'room':
      return { kind: 'room', roomId: open.roomId };
    case 'scene':
      return { kind: 'scene', sceneId: open.sceneId };
    case 'automation':
      return { kind: 'automation', automationId: open.automationId, focus: null };
    case 'command':
    case 'setting':
      return null;
  }
}

export function navTargetOfLink(link: ChatLink): NavPinTarget | null {
  switch (link.kind) {
    case 'setting_link':
      return { kind: 'setting', page: link.setting, setting: null };
    case 'device_settings_link':
      return { kind: 'device', deviceId: link.id, focus: null };
    case 'automation_link':
      return { kind: 'automation', automationId: link.id, focus: null };
    case 'scene_link':
      return { kind: 'scene', sceneId: link.id };
    case 'room_link':
      return { kind: 'room', roomId: link.id };
    case 'page_link':
      return link.page === 'chat' && link.id !== null ? { kind: 'chat', chatId: link.id } : null;
    case 'scheduled_link':
      return null;
  }
}
