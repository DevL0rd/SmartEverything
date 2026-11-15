import { useMemo } from 'react';
import { skipToken, useQueries } from '@tanstack/react-query';
import {
  FLOW_SCOPE_OUTPUTS,
  GEO_POINT,
  REF_KIND,
  type AutomationFunctionSummary,
  type FunctionLookup,
  type OptionSourceId,
  type Place,
  type RefKind,
  type RefNames,
} from '@smarteverything/domain';
import type { AutomationRow, FunctionDetail } from '../data/graph-adapter';
import type { LintContext } from '@smarteverything/flow/check/lint';
import { Logger } from '@smarteverything/logging';
import { useStableValue } from '../../../components/use-stable-value';
import { deepEqual } from '../model/editor/deep-equal';
import { useProfiles } from '../../../store/people';
import { useDevices, useIsOwner, useRooms, useRows, useSettings } from '../../../store/selectors';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useAutomationsSource } from '../data/source';
import { automationKeys } from '../data/keys';
import { useAutomations } from '../data/use-automations';
import { useFunctions } from '../data/use-functions';
import { useSecrets } from '../data/use-secrets';
import type {
  ReferenceCatalogue,
  ReferenceOption,
} from '../editor/inspector/values/value-services';
import { computersOf, phonesOf, referenceOptions } from './option-devices';
import { loadOptionRows, OptionsUnavailable } from './option-loaders';
import { remoteNeedOf } from './option-remote';
import { resolveOptions } from './option-sources';
import type { HomeData, OptionContext, OptionResult, OptionRow, RemoteState } from './option-types';

const NO_FUNCTIONS: readonly AutomationFunctionSummary[] = [];

type Names = ReadonlyMap<string, string>;

function table<T extends { readonly id: string }>(
  rows: readonly T[],
  nameOf: (row: T) => string,
): Names {
  return new Map(rows.map((row) => [row.id, nameOf(row)] as const));
}

export function sameNames(kept: Names, next: Names): boolean {
  if (kept.size !== next.size) return false;
  const theirs = next.entries();
  for (const [id, name] of kept) {
    const other = theirs.next();
    if (other.done === true || other.value[0] !== id || other.value[1] !== name) return false;
  }
  return true;
}

export function sameTables(
  kept: Readonly<Record<string, Names>>,
  next: Readonly<Record<string, Names>>,
): boolean {
  const entries = Object.entries(next);
  if (entries.length !== Object.keys(kept).length) return false;
  return entries.every(([kind, names]) => {
    const mine = kept[kind];
    return mine !== undefined && sameNames(mine, names);
  });
}

type Definitions = ReadonlyMap<string, AutomationRow['definition']>;

export function sameDefinitions(kept: Definitions, next: Definitions): boolean {
  if (kept.size !== next.size) return false;
  for (const [id, definition] of next) {
    if (!kept.has(id) || !deepEqual(kept.get(id), definition)) return false;
  }
  return true;
}

function useAutomationNames(): Names {
  const { rows } = useAutomations();
  const names = useMemo(() => table(rows, (row) => row.name), [rows]);
  return useStableValue(names, sameNames);
}

function useAutomationDefinitions(): Definitions {
  const { rows } = useAutomations();
  const definitions = useMemo(
    (): Definitions => new Map(rows.map((row) => [row.id, row.definition] as const)),
    [rows],
  );
  return useStableValue(definitions, sameDefinitions);
}

type HomeKind = Exclude<RefKind, 'automation' | 'function' | 'target' | 'secret'>;

function zoneList(): readonly string[] | null {
  return 'supportedValuesOf' in Intl ? ['UTC', ...Intl.supportedValuesOf('timeZone')] : null;
}

export function useAutomationHome(): HomeData {
  const devices = useDevices({ includeHidden: true });
  const rooms = useRooms();
  const groups = useRows('device_groups');
  const values = useRows('automation_values');
  const chats = useRows('ai_chats');
  const channels = useRows('talk_channels');
  const people = useProfiles();
  const automations = useAutomations().rows;
  return useMemo(
    () => ({
      devices,
      rooms,
      groups,
      people,
      chats,
      channels,
      values,
      automations,
      timeZones: zoneList(),
    }),
    [devices, rooms, groups, people, chats, channels, values, automations],
  );
}

function labelled(rows: readonly { readonly id: string; readonly label: string }[]): Names {
  return new Map(rows.map((row) => [row.id, row.label] as const));
}

function useHomeNames(): Readonly<Record<HomeKind, Names>> {
  const home = useAutomationHome();
  const cameras = useRows('cameras');
  const names = useMemo(
    () => ({
      device: table(home.devices, (row) => row.label),
      room: table(home.rooms, (row) => row.name),
      group: table(home.groups, (row) => row.name),
      person: table(home.people, (row) => row.name),
      computer: labelled(computersOf(home.devices)),
      phone: labelled(phonesOf(home.devices)),
      camera: new Map(
        cameras.flatMap((row) => {
          const device = home.devices.find((candidate) => candidate.id === row.device_id);
          return device === undefined ? [] : [[row.device_id, device.label] as const];
        }),
      ),
      chat: table(home.chats, (row) => row.title),
      value: table(home.values, (row) => row.content.name),
    }),
    [home, cameras],
  );
  return useStableValue(names, sameTables);
}

type NameTables = Readonly<Record<RefKind, Names>>;

export function targetNamesOf(home: Readonly<Record<'device' | 'room' | 'group', Names>>): Names {
  return new Map([...home.device, ...home.room, ...home.group]);
}

function useNameTables(): NameTables {
  const home = useHomeNames();
  const automations = useAutomationNames();
  const functions = useFunctions();
  const secrets = useSecrets(useIsOwner());
  const tables = useMemo(
    (): NameTables => ({
      ...home,
      automation: automations,
      function: table(functions.data ?? NO_FUNCTIONS, (row) => row.name),
      target: targetNamesOf(home),
      secret: table(secrets.data ?? [], (row) => row.name),
    }),
    [home, automations, functions.data, secrets.data],
  );
  return useStableValue(tables, sameTables);
}

export function useRefNames(): RefNames {
  const tables = useNameTables();
  return useMemo((): RefNames => (kind, id) => tables[kind].get(id), [tables]);
}

const log = new Logger('app.automations');

export function useReferenceCatalogue(): ReferenceCatalogue {
  const tables = useNameTables();
  const home = useAutomationHome();
  return useMemo(
    (): ReferenceCatalogue => ({
      options: (of, capabilities: readonly string[] = []): readonly ReferenceOption[] => {
        const kind = REF_KIND.safeParse(of);
        if (!kind.success) {
          log.error('automations.unknown_reference_kind', { of });
          return [];
        }
        if (capabilities.length > 0) return referenceOptions(home, kind.data, capabilities);
        return [...tables[kind.data]].map(([id, label]) => ({ id, label }));
      },
    }),
    [tables, home],
  );
}

function remoteStateOf(
  result: {
    readonly data: readonly OptionRow[] | undefined;
    readonly error: Error | null;
    readonly isPending: boolean;
  },
  enabled: boolean,
): RemoteState {
  if (!enabled) return { status: 'idle' };
  if (result.error !== null) {
    const reason =
      result.error instanceof OptionsUnavailable ? result.error.message : 'Could not load the list';
    return { status: 'failed', reason };
  }
  return result.data === undefined ? { status: 'loading' } : { status: 'ready', rows: result.data };
}

export function useOptionSource(source: OptionSourceId, context: OptionContext): OptionResult {
  const home = useAutomationHome();
  const need = remoteNeedOf(source, context);
  const fetch = need.kind === 'fetch' ? need.fetch : null;
  const query = useScreenQuery({
    queryKey: ['automations', 'option-source', fetch],
    queryFn:
      fetch === null ? skipToken : (): Promise<readonly OptionRow[]> => loadOptionRows(fetch),
  });
  const remote = remoteStateOf(query, fetch !== null);
  return useMemo(
    () => resolveOptions(source, context, home, remote),
    [source, context, home, remote],
  );
}

export function usePlace(): Place {
  const settings = useSettings();
  return useMemo(() => {
    const location = GEO_POINT.safeParse({
      latitude: settings.latitude,
      longitude: settings.longitude,
    });
    return { timeZone: settings.time_zone, location: location.success ? location.data : null };
  }, [settings.latitude, settings.longitude, settings.time_zone]);
}

type Details = ReadonlyMap<string, FunctionDetail>;

function combined(results: readonly { readonly data: FunctionDetail | undefined }[]): Details {
  return new Map(
    results.flatMap((result) =>
      result.data === undefined ? [] : [[result.data.id, result.data] as const],
    ),
  );
}

export function useFunctionDetails(): Details {
  const kinds = useAutomationsSource().lookup;
  const { api } = useAutomationsSource();
  const summaries = useFunctions().data ?? NO_FUNCTIONS;
  return useQueries({
    queries: summaries.map((summary) => ({
      queryKey: automationKeys.function(summary.id),
      queryFn: () => api.getFunction(summary.id, kinds),
    })),
    combine: combined,
  });
}

export function useFunctionLookup(): FunctionLookup {
  const details = useFunctionDetails();
  return useMemo(
    (): FunctionLookup => (id, revision) => {
      const detail = details.get(id);
      return detail !== undefined && (revision === undefined || revision === detail.revision)
        ? detail.program
        : undefined;
    },
    [details],
  );
}

export function useLintContext(): LintContext {
  const { lookup } = useAutomationsSource();
  const automations = useAutomationDefinitions();
  const summaries = useFunctions().data ?? NO_FUNCTIONS;
  const refs = useRefNames();
  const secrets = useSecrets(useIsOwner()).data;
  return useMemo((): LintContext => {
    const byId = new Map(summaries.map((summary) => [summary.id, summary] as const));
    return {
      kinds: (id) => lookup.get(id),
      automations: (id) => automations.get(id),
      scopeOutputs: (kind) => FLOW_SCOPE_OUTPUTS[kind] ?? [],
      references: (kind, id) => refs(kind, id) !== undefined,
      functions: (id) => byId.get(id)?.interface,
      secrets: new Set((secrets ?? []).map((entry) => entry.id)),
    };
  }, [lookup, automations, summaries, refs, secrets]);
}
