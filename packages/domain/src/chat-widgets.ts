import { z } from 'zod';
import { DAY } from './api/primitives';
import { HEALTH_METRICS, type HealthMetric } from './api/rows-access';

const ID = z.uuid();

export const HEALTH_WIDGET_RANGES = ['today', 'week', 'month'] as const;

export type HealthWidgetRange = (typeof HEALTH_WIDGET_RANGES)[number];

export const NUTRITION_WIDGET_PARTS = ['calories', 'macros', 'hydration'] as const;

export type NutritionWidgetPart = (typeof NUTRITION_WIDGET_PARTS)[number];

export const NUTRITION_WIDGET_OF: Readonly<Partial<Record<HealthMetric, NutritionWidgetPart>>> = {
  energy_in: 'calories',
  protein: 'macros',
  carbohydrate: 'macros',
  fat: 'macros',
  fiber: 'macros',
  sugar: 'macros',
  saturated_fat: 'macros',
  sodium: 'macros',
  caffeine: 'macros',
  hydration: 'hydration',
};

export const CHAT_LINK_VALUE_MAX = 80;

const LINK_VALUE = z.string().min(1).max(CHAT_LINK_VALUE_MAX).nullable();

export const BOARD_WIDGET_TYPE = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,59}$/);

export const CHAT_LINK_PAGES = ['chat', 'costs', 'plugin', 'person'] as const;

export type ChatLinkPage = (typeof CHAT_LINK_PAGES)[number];

export const PLUGIN_CHAT_BOARDS: Readonly<Record<string, readonly string[]>> = {
  router: ['router.internet', 'router.home'],
  adguard: ['adguard.blocking'],
  syncthing: ['syncthing.health', 'syncthing.folders'],
};

export const CHAT_WIDGET = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('device'), id: ID }),
  z.strictObject({ kind: z.literal('remote'), id: ID }),
  z.strictObject({ kind: z.literal('camera'), id: ID }),
  z.strictObject({
    kind: z.literal('health'),
    metric: z.enum(HEALTH_METRICS),
    range: z.enum(HEALTH_WIDGET_RANGES).default('week'),
    day: DAY.optional(),
  }),
  z.strictObject({
    kind: z.literal('nutrition'),
    part: z.enum(NUTRITION_WIDGET_PARTS),
    day: DAY.optional(),
  }),
  z.strictObject({
    kind: z.literal('board'),
    type: BOARD_WIDGET_TYPE,
    options: z.record(z.string().min(1).max(40), z.string().min(1).max(120)).optional(),
  }),
  z.strictObject({ kind: z.literal('weather') }),
  z.strictObject({ kind: z.literal('scenes') }),
  z.strictObject({
    kind: z.literal('setting_link'),
    setting: z.string().min(1).max(120),
    value: LINK_VALUE,
  }),
  z.strictObject({ kind: z.literal('device_settings_link'), id: ID, value: LINK_VALUE }),
  z.strictObject({ kind: z.literal('automation_link'), id: ID, value: LINK_VALUE }),
  z.strictObject({ kind: z.literal('scene_link'), id: ID, value: LINK_VALUE }),
  z.strictObject({ kind: z.literal('room_link'), id: ID, value: LINK_VALUE }),
  z.strictObject({ kind: z.literal('scheduled_link'), id: ID, value: LINK_VALUE }),
  z.strictObject({
    kind: z.literal('page_link'),
    page: z.enum(CHAT_LINK_PAGES),
    id: z.string().min(1).max(80).nullable(),
    value: LINK_VALUE,
  }),
]);

export type ChatWidget = z.output<typeof CHAT_WIDGET>;

export type ChatWidgetKind = ChatWidget['kind'];

export const CHAT_LINK_KINDS = [
  'setting_link',
  'device_settings_link',
  'automation_link',
  'scene_link',
  'room_link',
  'scheduled_link',
  'page_link',
] as const satisfies readonly ChatWidgetKind[];

export type ChatLinkKind = (typeof CHAT_LINK_KINDS)[number];

export type ChatLink = Extract<ChatWidget, { kind: ChatLinkKind }>;

export function isChatLink(widget: ChatWidget): widget is ChatLink {
  return CHAT_LINK_KINDS.some((kind) => kind === widget.kind);
}

export const CHAT_WIDGETS_MAX = 6;

function optionsKey(options: Readonly<Record<string, string>> | undefined): string {
  return Object.entries(options ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function specialKey(widget: ChatWidget): string | null {
  if (widget.kind === 'health') {
    return `health:${widget.metric}:${widget.range}:${widget.day ?? ''}`;
  }
  if (widget.kind === 'nutrition') {
    return `nutrition:${widget.part}:${widget.day ?? ''}`;
  }
  if (widget.kind === 'board') {
    return `board:${widget.type}:${optionsKey(widget.options)}`;
  }
  if (widget.kind === 'page_link') {
    return `page_link:${widget.page}:${widget.id ?? ''}`;
  }
  return widget.kind === 'setting_link' ? `setting_link:${widget.setting}` : null;
}

export function chatWidgetKey(widget: ChatWidget): string {
  return (
    specialKey(widget) ?? ('id' in widget ? `${widget.kind}:${String(widget.id)}` : widget.kind)
  );
}

export function chatWidgetsOf(embeds: readonly unknown[]): ChatWidget[] {
  return embeds.flatMap((embed) => {
    const parsed = CHAT_WIDGET.safeParse(embed);
    return parsed.success ? [parsed.data] : [];
  });
}

export function newChatWidgets(
  known: readonly ChatWidget[],
  wanted: readonly ChatWidget[],
): ChatWidget[] {
  const keys = new Set(known.map(chatWidgetKey));
  const fresh = wanted.filter((widget) => {
    const key = chatWidgetKey(widget);
    if (keys.has(key)) {
      return false;
    }
    keys.add(key);
    return true;
  });
  return fresh.slice(0, Math.max(0, CHAT_WIDGETS_MAX - known.length));
}
