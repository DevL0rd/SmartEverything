import { z } from 'zod';

export const AI_MEMORY_SCOPES = ['person', 'home'] as const;

export const AI_MEMORY_SCOPE = z.enum(AI_MEMORY_SCOPES);

export type AiMemoryScope = z.output<typeof AI_MEMORY_SCOPE>;

export const AI_MEMORY_TEXT = z
  .string()
  .trim()
  .min(1)
  .describe('One self-contained fact, written so it makes sense without the chat it came from');

export const AI_MEMORY_KINDS = ['fact', 'preference', 'episode', 'vocabulary'] as const;

export const AI_MEMORY_KIND = z
  .enum(AI_MEMORY_KINDS)
  .describe(
    'fact is true about the person, someone they know or the household; preference is a like, dislike or how they want things; episode is something that happened, often done together; vocabulary is a word or phrase the person uses with its meaning',
  );

export type AiMemoryKind = z.output<typeof AI_MEMORY_KIND>;

export const AI_MEMORY_IMPORTANCE = z
  .int()
  .min(0)
  .max(100)
  .describe(
    '0 to 100: 5 trivia, 25 small habit, 50 useful fact of daily life, 75 significant personal fact, 90 and above core identity that never fades',
  );

const MEMORY_DATE = z.iso.date().nullable();

const MOMENT = z.iso.datetime({ offset: true });

export const AI_MEMORY = z.strictObject({
  id: z.uuid(),
  scope: AI_MEMORY_SCOPE,
  text: AI_MEMORY_TEXT,
  source_chat_id: z.uuid().nullable(),
  source_message_id: z.uuid().nullable(),
  kind: AI_MEMORY_KIND,
  importance: AI_MEMORY_IMPORTANCE,
  happened_on: MEMORY_DATE.describe('The date an episode happened, else null'),
  valid_until: MEMORY_DATE.describe('The date after which a time-bound memory stops being true'),
  recalled_at: MOMENT.nullable(),
  recall_count: z.int().nonnegative(),
  created_at: MOMENT,
  updated_at: MOMENT,
});

export type AiMemory = z.output<typeof AI_MEMORY>;

export const AI_MEMORY_LINE = AI_MEMORY.pick({
  id: true,
  scope: true,
  text: true,
  kind: true,
  importance: true,
  happened_on: true,
  valid_until: true,
  updated_at: true,
});

export type AiMemoryLine = z.output<typeof AI_MEMORY_LINE>;

export const AI_MEMORY_TOOL_LINE = AI_MEMORY_LINE.omit({ updated_at: true }).extend({
  saved: z
    .string()
    .describe('When the note was last saved, in the home time zone, with how long ago that was'),
});

export type AiMemoryToolLine = z.output<typeof AI_MEMORY_TOOL_LINE>;

export const AI_MEMORY_SETTINGS = z.strictObject({
  enabled: z
    .boolean()
    .describe(
      'Whether the AI keeps and recalls memories for this person; off hides the memory tool and recalls nothing, and stored memories stay until deleted',
    ),
  prompt_chars: z
    .int()
    .positive()
    .nullable()
    .describe('Characters of memories the AI is shown each turn; unset uses 3000'),
});

export type AiMemorySettings = z.output<typeof AI_MEMORY_SETTINGS>;

export const AI_MEMORY_SETTINGS_CHANGE = AI_MEMORY_SETTINGS.partial().refine(
  (patch) => Object.keys(patch).length > 0,
  { message: 'name at least one setting to change' },
);

export type AiMemorySettingsChange = z.output<typeof AI_MEMORY_SETTINGS_CHANGE>;

export const AI_MEMORY_LIST = z.strictObject({
  settings: AI_MEMORY_SETTINGS,
  memories: z.array(AI_MEMORY),
});

export type AiMemoryList = z.output<typeof AI_MEMORY_LIST>;

const MEMORY_DETAILS = {
  kind: AI_MEMORY_KIND,
  importance: AI_MEMORY_IMPORTANCE,
  happened_on: z.iso.date().nullable(),
  valid_until: z.iso.date().nullable(),
};

export const AI_MEMORY_ADD = z.strictObject({
  scope: AI_MEMORY_SCOPE,
  text: AI_MEMORY_TEXT,
  kind: MEMORY_DETAILS.kind.optional(),
  importance: MEMORY_DETAILS.importance.optional(),
  happened_on: MEMORY_DETAILS.happened_on.optional(),
  valid_until: MEMORY_DETAILS.valid_until.optional(),
});

export type AiMemoryAdd = z.output<typeof AI_MEMORY_ADD>;

export const AI_MEMORY_CHANGE = z
  .strictObject({ text: AI_MEMORY_TEXT, ...MEMORY_DETAILS })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'name at least one field to change',
  });

export type AiMemoryChange = z.output<typeof AI_MEMORY_CHANGE>;

export const AI_MEMORY_FORGET = z.strictObject({ scope: AI_MEMORY_SCOPE });

export const AI_MEMORY_FORGOTTEN = z.strictObject({ removed: z.int().nonnegative() });

export const AI_MEMORY_PARAMS = z.strictObject({ memoryId: z.uuid() });

const TOOL_DETAILS = {
  kind: AI_MEMORY_KIND.optional(),
  importance: AI_MEMORY_IMPORTANCE.optional(),
  happened_on: z.iso.date().optional(),
  valid_until: z.iso.date().optional(),
};

const TOOL_TEXT = z
  .string({ error: 'add needs text: the note itself, one self-contained fact, as a string' })
  .trim()
  .min(1, { error: 'text is empty: write the note itself, one self-contained fact' });

const TOOL_ID = z.uuid({ error: 'id must be the id of a note, as listed by view' });

export const AI_MEMORY_TOOL_ARGUMENTS = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('view'),
    scope: AI_MEMORY_SCOPE.optional(),
    query: z.string().trim().min(1).optional(),
  }),
  z.strictObject({
    action: z.literal('add'),
    scope: z.enum(AI_MEMORY_SCOPES, { error: 'add needs scope: person or home' }),
    text: TOOL_TEXT,
    ...TOOL_DETAILS,
  }),
  z
    .strictObject({
      action: z.literal('edit'),
      id: TOOL_ID,
      text: TOOL_TEXT.optional(),
      ...TOOL_DETAILS,
    })
    .refine(
      (args) =>
        args.text !== undefined ||
        args.kind !== undefined ||
        args.importance !== undefined ||
        args.happened_on !== undefined ||
        args.valid_until !== undefined,
      { message: 'edit needs at least one field to change, such as text' },
    ),
  z.strictObject({ action: z.literal('delete'), id: TOOL_ID }),
]);

export type AiMemoryToolArguments = z.output<typeof AI_MEMORY_TOOL_ARGUMENTS>;

export const AI_MEMORY_OUTCOMES = ['added', 'merged', 'unchanged'] as const;

export const AI_MEMORY_OUTCOME = z
  .enum(AI_MEMORY_OUTCOMES)
  .describe(
    'added is a new note, merged means a similar or older note was updated, unchanged means nothing needed to change',
  );

export type AiMemoryOutcome = z.output<typeof AI_MEMORY_OUTCOME>;

export const AI_MEMORY_TOOL_RESULT = z.union([
  z.strictObject({ memories: z.array(AI_MEMORY_TOOL_LINE) }),
  z.strictObject({ memory: AI_MEMORY_TOOL_LINE, outcome: AI_MEMORY_OUTCOME }),
  z.strictObject({ deleted: z.uuid() }),
]);

export type AiMemoryToolResult = z.output<typeof AI_MEMORY_TOOL_RESULT>;

export const AI_MEMORY_RECALL = z.strictObject({
  time_zone: z.string().min(1),
  prompt_chars: AI_MEMORY_SETTINGS.shape.prompt_chars,
  core: z.array(AI_MEMORY_LINE),
  vocabulary: z.array(AI_MEMORY_LINE),
  relevant: z.array(AI_MEMORY_LINE),
  recent: z.array(AI_MEMORY_LINE),
  today: z.array(AI_MEMORY_LINE),
  week: z.array(AI_MEMORY_LINE),
  month: z.array(AI_MEMORY_LINE),
  year: z.array(AI_MEMORY_LINE),
  faded: z.int().nonnegative(),
});

export type AiMemoryRecall = z.output<typeof AI_MEMORY_RECALL>;

export interface AiMemoryAccess {
  readonly offered: (sessionId: string) => boolean;
  readonly prepare: (sessionId: string) => Promise<void>;
  readonly recall: (sessionId: string) => AiMemoryRecall;
  readonly call: (sessionId: string, args: AiMemoryToolArguments) => Promise<AiMemoryToolResult>;
}

const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const DAY_HOURS = 24;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
const YEAR_DAYS = 365;
const MONTHS_PER_YEAR = 12;

function counted(amount: number, name: string): string {
  return `${String(amount)} ${name}${amount === 1 ? '' : 's'}`;
}

function paired(major: number, majorName: string, minor: number, minorName: string): string {
  return minor === 0
    ? counted(major, majorName)
    : `${counted(major, majorName)} and ${counted(minor, minorName)}`;
}

export function memoryAge(moment: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(moment)) / MINUTE_MS));
  const hours = Math.floor(minutes / HOUR_MINUTES);
  const days = Math.floor(hours / DAY_HOURS);
  if (minutes < 1) return 'just now';
  if (hours < 1) return `${counted(minutes, 'minute')} ago`;
  if (days < 1) return `${String(hours)} hr ago`;
  if (days < WEEK_DAYS) return `${counted(days, 'day')} ago`;
  if (days < MONTH_DAYS)
    return `${paired(Math.floor(days / WEEK_DAYS), 'week', days % WEEK_DAYS, 'day')} ago`;
  if (days < YEAR_DAYS) {
    const rest = days % MONTH_DAYS;
    return `${paired(Math.floor(days / MONTH_DAYS), 'month', Math.floor(rest / WEEK_DAYS), 'week')} ago`;
  }
  const rest = days % YEAR_DAYS;
  return `${paired(Math.floor(days / YEAR_DAYS), 'year', Math.floor((rest * MONTHS_PER_YEAR) / YEAR_DAYS), 'month')} ago`;
}

export function memoryClock(moment: string, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(moment));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

export function memorySaved(moment: string, now: Date, zone: string): string {
  return `saved ${memoryClock(moment, zone)}, ${memoryAge(moment, now)}`;
}
