import {
  API_ENDPOINTS as E,
  HEALTH_METRICS,
  defaultWaterPercent,
  localClock,
  type McpPartName,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import type { Adapter, Args } from './adapters';
import { MOMENT_ARGUMENT, PERSON, type ToolContext } from './registry';
import { entrySpan } from './spans';

const DAY_MS = 86_400_000;

const MOMENT_FIELDS = { from: true, to: true } as const;

function dayText(context: ToolContext, at: Date): string {
  const clock = localClock(at, context.store.settings.read().time_zone);
  const two = (value: number): string => String(value).padStart(2, '0');
  return `${String(clock.year)}-${two(clock.month)}-${two(clock.day)}`;
}

function daysBack(days: number): NonNullable<Adapter['prepare']> {
  return (context, raw) => {
    const to = typeof raw['to'] === 'string' ? raw['to'] : dayText(context, context.clock.now());
    const from =
      typeof raw['from'] === 'string'
        ? raw['from']
        : dayText(context, new Date(Date.parse(to) - days * DAY_MS));
    return { ...raw, from, to };
  };
}

function momentsBack(days: number): NonNullable<Adapter['prepare']> {
  return (context, raw) => {
    const now = context.clock.now();
    const to = typeof raw['to'] === 'string' ? raw['to'] : now.toISOString();
    const from =
      typeof raw['from'] === 'string'
        ? raw['from']
        : new Date(Date.parse(to) - days * DAY_MS).toISOString();
    return { ...raw, from, to };
  };
}

const DAILY: Adapter = {
  input: (base) => base.partial({ ...MOMENT_FIELDS, metrics: true }),
  prepare: (context, raw) => ({
    ...daysBack(6)(context, raw),
    metrics: raw['metrics'] ?? [...HEALTH_METRICS],
  }),
};

const WATCH_DAYS: Adapter = {
  input: (base) => base.partial(MOMENT_FIELDS),
  prepare: daysBack(6),
};

const RECORDS: Adapter = {
  input: (base) => base.partial(MOMENT_FIELDS),
  prepare: momentsBack(1),
};

const ENTRIES: Adapter = {
  input: (base) => base.partial(MOMENT_FIELDS),
  prepare: momentsBack(30),
};

const ENTRY_CHANGE = z.object({
  entryId: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  personId: z.string().optional(),
});

const UPDATE_ENTRY: Adapter = {
  input: () =>
    z
      .strictObject({
        entryId: z.uuid(),
        startTime: MOMENT_ARGUMENT.optional().describe('The new start; the logged one stays when left out'),
        endTime: MOMENT_ARGUMENT.optional().describe('The new end of a session; the logged one stays when left out'),
        data: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Fields of the record to change, shaped as health_read view types gives; the other fields stay'),
        personId: PERSON,
      })
      .refine((input) => [input.startTime, input.endTime, input.data].some((part) => part !== undefined), {
        message: 'give startTime, endTime or data to change',
      }),
  run: async (context, raw, base) => {
    const change = ENTRY_CHANGE.parse(raw);
    const as = { personId: change.personId };
    const entry = E.readHealthEntry.response.parse(
      await operate(context, 'readHealthEntry', { params: { entryId: change.entryId } }, as),
    );
    const span =
      change.startTime === undefined && change.endTime === undefined
        ? {
            startTime: entry.start_time,
            endTime: entry.end_time,
            zoneOffsetSeconds: entry.zone_offset_seconds,
          }
        : entrySpan(
            context,
            entry.record_type,
            new Date(change.startTime ?? entry.start_time),
            change.endTime ?? entry.end_time ?? undefined,
          );
    return base.call(context, {
      entryId: change.entryId,
      ...(change.personId === undefined ? {} : { personId: change.personId }),
      body: {
        type: entry.record_type,
        ...span,
        data: { ...entry.data, ...change.data },
        food: entry.food,
      },
    });
  },
};

const FOOD_FACTS = z.object({ kind: z.enum(['food', 'drink']).optional() });

const CREATE_FOOD: Adapter = {
  input: (base) =>
    base.partial({
      brand: true,
      barcode: true,
      kind: true,
      basis: true,
      serving: true,
      kcal: true,
      grams: true,
      waterPercent: true,
      origin: true,
      favourite: true,
    }),
  args: (_context, input) => {
    const kind = FOOD_FACTS.parse(input).kind ?? 'food';
    return {
      brand: null,
      barcode: null,
      kind,
      basis: { amount: 100, unit: kind === 'drink' ? 'ml' : 'g' },
      serving: null,
      kcal: null,
      grams: {},
      waterPercent: defaultWaterPercent(kind, false),
      origin: 'custom',
      favourite: false,
      ...input,
    };
  },
};

const REVISION = z.object({ plan: z.object({ revision: z.string() }).nullable() });

const FIX_FIREWALL: Adapter = {
  input: (base) => base.omit({ revision: true }),
  run: async (context, _input, base) => {
    const status = REVISION.parse(await operate(context, 'readFirewall', {}, {}));
    return base.call(context, { revision: status.plan?.revision ?? '' });
  },
};

const MEMBER = z.strictObject({
  memberKind: z.enum(['client', 'camera']).describe('client for an app, camera for a camera'),
  memberId: z.uuid().describe('The id of the app or camera'),
  listening: z.boolean().optional().describe('true lets this member hear the channel'),
});

const MEMBERS = z.array(z.unknown());

const CREATE_CHANNEL: Adapter = {
  input: (base) =>
    base.omit({ members: true }).extend({
      members: z.array(MEMBER).max(100).optional().describe('The members: app clients or cameras'),
    }),
  args: (_context, input): Args => ({
    ...input,
    members: MEMBERS.parse(input['members'] ?? []).map((member) => {
      const entry = MEMBER.parse(member);
      return {
        member_kind: entry.memberKind,
        member_id: entry.memberId,
        ...(entry.listening === undefined ? {} : { listening: entry.listening }),
      };
    }),
  }),
};

export const LIFE_ADAPTERS: Readonly<Partial<Record<McpPartName, Adapter>>> = {
  read_health_daily: DAILY,
  read_watch_days: WATCH_DAYS,
  read_health_records: RECORDS,
  list_health_entries: ENTRIES,
  update_health_entry: UPDATE_ENTRY,
  create_food: CREATE_FOOD,
  apply_firewall: FIX_FIREWALL,
  create_talk_channel: CREATE_CHANNEL,
};
