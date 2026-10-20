import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  FLOW_SCOPE_OUTPUTS,
  GEO_POINT,
  NODE_REGISTRY,
  REF_KIND,
  type AutomationFunctionDetail,
  type AutomationFunctionSummary,
  type FunctionLookup,
  type Place,
  type RefKind,
  type RefNames,
} from '@smarteverything/domain';
import type { LintContext } from '@smarteverything/flow/check/lint';
import { Logger } from '@smarteverything/logging';
import { useProfiles } from '../../../store/people';
import { useDevices, useIsOwner, useRooms, useRows, useSettings } from '../../../store/selectors';
import { useAutomationsSource } from '../data/source';
import { automationKeys } from '../data/keys';
import { useAutomations } from '../data/use-automations';
import { useFunctions } from '../data/use-functions';
import { useSecrets } from '../data/use-secrets';
import type {
  ReferenceCatalogue,
  ReferenceOption,
} from '../editor/inspector/values/value-services';

const NO_FUNCTIONS: readonly AutomationFunctionSummary[] = [];

type Names = ReadonlyMap<string, string>;

function table<T extends { readonly id: string }>(
  rows: readonly T[],
  nameOf: (row: T) => string,
): Names {
  return new Map(rows.map((row) => [row.id, nameOf(row)] as const));
}

type HomeKind = Exclude<RefKind, 'automation' | 'function' | 'target' | 'secret'>;

function useHomeNames(): Readonly<Record<HomeKind, Names>> {
  const devices = useDevices({ includeHidden: true });
  const rooms = useRooms();
  const groups = useRows('device_groups');
  const scenes = useRows('scenes');
  const values = useRows('automation_values');
  const cameras = useRows('cameras');
  const clients = useRows('clients');
  const chats = useRows('ai_chats');
  const people = useProfiles();
  return useMemo(
    () => ({
      device: table(devices, (row) => row.label),
      room: table(rooms, (row) => row.name),
      group: table(groups, (row) => row.name),
      scene: table(scenes, (row) => row.name),
      person: table(people, (row) => row.name),
      computer: table(clients, (row) => row.name),
      phone: table(clients, (row) => row.name),
      camera: new Map(
        cameras.flatMap((row) => {
          const device = devices.find((candidate) => candidate.id === row.device_id);
          return device === undefined ? [] : [[row.device_id, device.label] as const];
        }),
      ),
      chat: table(chats, (row) => row.title),
      value: table(values, (row) => row.content.name),
    }),
    [devices, rooms, groups, scenes, values, cameras, clients, chats, people],
  );
}

type NameTables = Readonly<Record<RefKind, Names>>;

export function targetNamesOf(home: Readonly<Record<'device' | 'room' | 'group', Names>>): Names {
  return new Map([...home.device, ...home.room, ...home.group]);
}

function useNameTables(): NameTables {
  const home = useHomeNames();
  const automations = useAutomations();
  const functions = useFunctions();
  const secrets = useSecrets(useIsOwner());
  return useMemo(
    (): NameTables => ({
      ...home,
      automation: table(automations.rows, (row) => row.name),
      function: table(functions.data ?? NO_FUNCTIONS, (row) => row.name),
      target: targetNamesOf(home),
      secret: table(secrets.data ?? [], (row) => row.name),
    }),
    [home, automations.rows, functions.data, secrets.data],
  );
}

export function useRefNames(): RefNames {
  const tables = useNameTables();
  return useMemo((): RefNames => (kind, id) => tables[kind].get(id), [tables]);
}

const log = new Logger('app.automations');

export function useReferenceCatalogue(): ReferenceCatalogue {
  const tables = useNameTables();
  return useMemo(
    (): ReferenceCatalogue => ({
      options: (of): readonly ReferenceOption[] => {
        const kind = REF_KIND.safeParse(of);
        if (!kind.success) {
          log.error('automations.unknown_reference_kind', { of });
          return [];
        }
        return [...tables[kind.data]].map(([id, label]) => ({ id, label }));
      },
    }),
    [tables],
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

type Details = ReadonlyMap<string, AutomationFunctionDetail>;

function combined(
  results: readonly { readonly data: AutomationFunctionDetail | undefined }[],
): Details {
  return new Map(
    results.flatMap((result) =>
      result.data === undefined ? [] : [[result.data.id, result.data] as const],
    ),
  );
}

export function useFunctionDetails(): Details {
  const { api } = useAutomationsSource();
  const summaries = useFunctions().data ?? NO_FUNCTIONS;
  return useQueries({
    queries: summaries.map((summary) => ({
      queryKey: automationKeys.function(summary.id),
      queryFn: () => api.getFunction(summary.id),
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
  const { kinds } = useAutomationsSource();
  const automations = useAutomations().byId;
  const summaries = useFunctions().data ?? NO_FUNCTIONS;
  const refs = useRefNames();
  const secrets = useSecrets(useIsOwner()).data;
  return useMemo((): LintContext => {
    const registry = new Map(kinds.map((kind) => [kind.id, kind] as const));
    const byId = new Map(summaries.map((summary) => [summary.id, summary] as const));
    return {
      kinds: (id) => registry.get(id) ?? NODE_REGISTRY.get(id),
      automations: (id) => automations.get(id)?.definition,
      scopeOutputs: (kind) => FLOW_SCOPE_OUTPUTS[kind] ?? [],
      references: (kind, id) => refs(kind, id) !== undefined,
      functions: (id) => byId.get(id)?.interface,
      secrets: new Set((secrets ?? []).map((entry) => entry.id)),
    };
  }, [kinds, automations, summaries, refs, secrets]);
}
