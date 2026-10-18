import {
  type AiChatRow,
  type AutomationRow,
  type AutomationV2,
  type AutomationValueRow,
  type DeviceGroupRow,
  type InputDeclarationV2,
  type ProfileRow,
  type RoomRow,
  type SceneRow,
} from '@smarteverything/domain';
import { usePendingKeys } from '../../../components/deferred-action';
import { compareText } from '../../../format/text';
import { deviceTimeZone } from '../../../platform/time-zone';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { useDevices, useIsOwner, useRooms, useRows, useSettings } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { automationKey } from './actions';
import { useComputerFeatureLists } from './use-computer-choices';
import { sentenceOf, summarize, type Names } from '../model/describe';
import { computersOf } from '../model/computer-steps';
import type { ComputerFeatures } from '../model/computer-templates';
import { placeStatus, type PlaceStatus } from '../model/place-status';
import {
  callablesIn,
  isReusable,
  storedAutomationOf,
  type Callable,
} from '../model/reusable-steps';
import { sectionOf, usesPlace, type ListSection } from '../model/rules';
import { placeOf, type PlaceReading, type Scheduled } from '../model/schedule';
import { templatesFor, unusedTemplates, type Template } from '../model/templates';

export interface Catalog {
  readonly devices: readonly Device[];
  readonly allDevices: readonly Device[];
  readonly scenes: readonly SceneRow[];
  readonly people: readonly ProfileRow[];
  readonly chats: readonly AiChatRow[];
  readonly wakeProfileId: string | null;
  readonly speakers: readonly Device[];
  readonly names: Names;
  readonly values: readonly AutomationValueRow[];
  readonly groups: readonly DeviceGroupRow[];
  readonly rooms: readonly RoomRow[];
  readonly automations: readonly AutomationRow[];
  readonly callable: readonly Callable[];
  readonly inputs: readonly InputDeclarationV2[];
}

const WAKEABLE_KINDS: ReadonlySet<AiChatRow['kind']> = new Set(['chat', 'call']);

function useWakeProfileId(): string | null {
  const owner = useIsOwner();
  const active = useActiveProfile();
  return owner && active !== null ? active.id : null;
}

export interface RuleView {
  readonly row: AutomationRow;
  readonly automation: AutomationV2 | null;
  readonly sentence: string | null;
  readonly section: ListSection;
}

export function useCatalog(): Catalog {
  const devices = useDevices({ includeHidden: true });
  const rooms = useRooms();
  const scenes = useRows('scenes');
  const values = useRows('automation_values');
  const groups = useRows('device_groups');
  const automations = useRows('automations');
  const people = useProfiles();
  const chats = useRows('ai_chats').filter(
    (chat) => chat.archived_at === null && WAKEABLE_KINDS.has(chat.kind),
  );
  const wakeProfileId = useWakeProfileId();
  const cameras = useRows('cameras');
  return {
    values,
    groups,
    rooms,
    automations,
    callable: callablesIn(automations),
    inputs: [],
    devices: devices.filter((device) => !device.hidden),
    allDevices: devices,
    scenes,
    people,
    chats,
    wakeProfileId,
    speakers: devices.filter((device) =>
      cameras.some((camera) => camera.device_id === device.id && camera.two_way_audio),
    ),
    names: { devices, scenes, people, chats, values, groups, rooms, automations },
  };
}

export function inScope(
  catalog: Catalog,
  scope: { readonly self: string | null; readonly inputs: readonly InputDeclarationV2[] },
): Catalog {
  return {
    ...catalog,
    inputs: scope.inputs,
    callable: catalog.callable.filter((entry) => entry.id !== scope.self),
  };
}

export function ruleOf(row: AutomationRow, names: Names): RuleView {
  const automation = storedAutomationOf(row);
  return {
    row,
    automation,
    sentence: automation === null ? null : sentenceOf(summarize(names, automation)),
    section: sectionOf({ automation, enabled: row.enabled, lastError: row.last_error }),
  };
}

function rulesOf(catalog: Catalog, pending: ReadonlySet<string>): readonly RuleView[] {
  return [...catalog.automations]
    .filter((row) => {
      const automation = storedAutomationOf(row);
      return (
        !pending.has(automationKey(row.id)) && (automation === null || !isReusable(automation))
      );
    })
    .sort((left, right) => compareText(left.name, right.name))
    .map((row) => ruleOf(row, catalog.names));
}

export function usePlaceReading(): PlaceReading {
  const settings = useSettings();
  return placeOf(settings);
}

export function scheduledOf(rule: RuleView): Scheduled | null {
  return rule.automation === null
    ? null
    : { automation: rule.automation, enabled: rule.row.enabled, lastRunAt: rule.row.last_run_at };
}

function ideasFor(
  catalog: Catalog,
  rules: readonly RuleView[],
  computerFeatures: ComputerFeatures,
): readonly Template[] {
  return unusedTemplates(
    templatesFor(catalog.devices, computerFeatures),
    rules.map((rule) => rule.row.name),
  );
}

function usesSun(rules: readonly RuleView[]): boolean {
  return rules.some((rule) => rule.automation !== null && usesPlace(rule.automation));
}

export interface AutomationsPage {
  readonly catalog: Catalog;
  readonly rules: readonly RuleView[];
  readonly reading: PlaceReading;
  readonly ideas: readonly Template[];
  readonly status: PlaceStatus;
}

export function useAutomationsPage(): AutomationsPage {
  const catalog = useCatalog();
  const rules = rulesOf(catalog, usePendingKeys());
  const reading = usePlaceReading();
  const computerFeatures = useComputerFeatureLists(computersOf(catalog.devices));
  return {
    catalog,
    rules,
    reading,
    ideas: ideasFor(catalog, rules, computerFeatures),
    status: placeStatus(reading, deviceTimeZone(), usesSun(rules)),
  };
}

export function countLine(rules: readonly RuleView[]): string | undefined {
  if (rules.length === 0) {
    return undefined;
  }
  const on = rules.filter((rule) => rule.row.enabled).length;
  const paused = rules.length - on;
  return paused === 0 ? `${String(on)} on` : `${String(on)} on · ${String(paused)} paused`;
}
