import { z } from 'zod';
import { DAY } from './api/primitives';
import { HEALTH_METRICS } from './api/rows-access';

const ID = z.uuid();

export const HEALTH_WIDGET_RANGES = ['today', 'week', 'month'] as const;

export type HealthWidgetRange = (typeof HEALTH_WIDGET_RANGES)[number];

export const NUTRITION_WIDGET_PARTS = ['calories', 'macros', 'hydration'] as const;

export type NutritionWidgetPart = (typeof NUTRITION_WIDGET_PARTS)[number];

export const CHAT_LINK_VALUE_MAX = 80;

const LINK_VALUE = z.string().min(1).max(CHAT_LINK_VALUE_MAX).nullable();

export const BOARD_WIDGET_TYPE = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,112}$/);

export const CHAT_LINK_PAGES = ['chat', 'costs', 'plugin', 'person'] as const;

export type ChatLinkPage = (typeof CHAT_LINK_PAGES)[number];

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

export const CHAT_WIDGET_GUIDE: Readonly<Record<ChatWidgetKind, string>> = {
  device:
    'id: a live card of one device, with its state and controls (deviceId of any non-camera device)',
  remote: 'id: an infrared remote with its buttons (remote id from remote_find)',
  camera: 'id: a live camera view (deviceId of a camera)',
  health: `metric, range (${HEALTH_WIDGET_RANGES.join(', ')}; default week), optional day (YYYY-MM-DD): a chart of one health measurement; needs recorded data in the last 30 days`,
  nutrition: `part (${NUTRITION_WIDGET_PARTS.join(', ')}), optional day (YYYY-MM-DD): the day's food or water totals`,
  board:
    'type (one of the board types given with the reply context, pluginId.widgetId for what a plugin adds), optional options: a plugin status board; an unknown type is refused with the types that exist',
  weather: 'the current weather and forecast',
  scenes: 'the scenes of the home, to run with a tap',
  setting_link:
    'setting (a settings page id or setting id from the app’s settings), value (what it was set to, or null): a button that opens that setting',
  device_settings_link: 'id (deviceId), value or null: a button that opens the device’s settings',
  automation_link: 'id (automation id), value or null: a button that opens the automation',
  scene_link: 'id (scene id), value or null: a button that opens the scene',
  room_link: 'id (room id), value or null: a button that opens the room',
  scheduled_link: 'id (scheduleId), value or null: a button that opens the scheduled step',
  page_link: `page (${CHAT_LINK_PAGES.join(', ')}), id or null, value or null: a button that opens that page`,
};

export const SHOW_WIDGETS_INPUT = z.strictObject({
  widgets: z.array(CHAT_WIDGET).min(1).max(CHAT_WIDGETS_MAX),
});

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
  return wanted.filter((widget) => {
    const key = chatWidgetKey(widget);
    if (keys.has(key)) {
      return false;
    }
    keys.add(key);
    return true;
  });
}

export const SHOW_WIDGETS_TEXT = `Attaches widgets to the reply you are writing in this chat: live cards and charts the person sees under your message. Needs ids from reads, never guesses; one call can hold up to ${String(CHAT_WIDGETS_MAX)} widgets, a reply shows at most ${String(CHAT_WIDGETS_MAX)} in all (the ones that do not fit come back in dropped), it can be called again, and the same widget is not added twice. Each widget has a kind and its fields. Kinds: ${Object.entries(
  CHAT_WIDGET_GUIDE,
)
  .map(([kind, text]) => `${kind} (${text})`)
  .join('; ')}.`;
