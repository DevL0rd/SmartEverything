import {
  AUTOMATION_DEFINITION,
  displayName,
  type AiChatRow,
  type AutomationDefinition,
  type AutomationValueRow,
  type AutomationSequenceRow,
  type SequenceParameter,
  type DeviceGroupRow,
  type RoomRow,
  type AutomationRow,
  type ProfileRow,
  type SceneRow,
} from '@smarteverything/domain';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { useDevices, useIsOwner, useRooms, useRows, useSettings } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { summarize, sentenceOf, type Names, type Summary } from '../model/describe';
import { deviceTimeZone } from '../../../platform/time-zone';
import { placeStatus, type PlaceStatus } from '../model/place-status';
import { sectionOf, type ListSection } from '../model/rules';
import { placeOf, type PlaceReading, type Scheduled } from '../model/schedule';
import { templatesFor, unusedTemplates, type Template } from '../model/templates';

export interface Catalog {
  readonly devices: readonly Device[];
  readonly allDevices: readonly Device[];
  readonly scenes: readonly SceneRow[];
  readonly people: readonly ProfileRow[];
  readonly chats: readonly AiChatRow[];
  readonly wakeProfileId: string | null;
  readonly names: Names;
  readonly values?: readonly AutomationValueRow[];
  readonly sequences?: readonly AutomationSequenceRow[];
  readonly parameters?: readonly SequenceParameter[];
  readonly groups?: readonly DeviceGroupRow[];
  readonly rooms?: readonly RoomRow[];
  readonly automations?: readonly AutomationRow[];
}

const WAKEABLE_KINDS: ReadonlySet<AiChatRow['kind']> = new Set(['chat', 'call']);

function useWakeProfileId(): string | null {
  const owner = useIsOwner();
  const active = useActiveProfile();
  return owner && active !== null ? active.id : null;
}

export interface RuleView {
  readonly row: AutomationRow;
  readonly definition: AutomationDefinition | null;
  readonly summary: Summary | null;
  readonly sentence: string | null;
  readonly section: ListSection;
}

export function useCatalog(): Catalog {
  const devices = useDevices({ includeHidden: true });
  const rooms = useRooms();
  const scenes = useRows('scenes');
  const values = useRows('automation_values');
  const sequences = useRows('automation_sequences');
  const groups = useRows('device_groups');
  const automations = useRows('automations');
  const people = useProfiles();
  const chats = useRows('ai_chats').filter(
    (chat) => chat.archived_at === null && WAKEABLE_KINDS.has(chat.kind),
  );
  const wakeProfileId = useWakeProfileId();
  const allDevices = devices.map((device) => ({
    ...device,
    label: displayName(device, devices, rooms),
  }));
  return {
    values,
    sequences,
    groups,
    rooms,
    automations,
    devices: allDevices.filter((device) => !device.hidden),
    allDevices,
    scenes,
    people,
    chats,
    wakeProfileId,
    names: {
      devices: allDevices,
      scenes,
      people,
      chats,
      values,
      sequences,
      groups,
      rooms,
      automations,
    },
  };
}

function ruleOf(row: AutomationRow, names: Names): RuleView {
  const parsed = AUTOMATION_DEFINITION.safeParse(row.definition);
  const definition = parsed.success ? parsed.data : null;
  const summary = definition === null ? null : summarize(names, definition);
  return {
    row,
    definition,
    summary,
    sentence: summary === null ? null : sentenceOf(summary),
    section: sectionOf({ definition, enabled: row.enabled, lastError: row.last_error }),
  };
}

function useRules(names: Names): readonly RuleView[] {
  const rows = useRows('automations');
  return [...rows]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((row) => ruleOf(row, names));
}

export function usePlaceReading(): PlaceReading {
  const settings = useSettings();
  return placeOf(settings);
}

export function scheduledOf(rule: RuleView): Scheduled | null {
  return rule.definition === null
    ? null
    : { definition: rule.definition, enabled: rule.row.enabled, lastRunAt: rule.row.last_run_at };
}

function ideasFor(catalog: Catalog, rules: readonly RuleView[]): readonly Template[] {
  return unusedTemplates(
    templatesFor(catalog.devices),
    rules.map((rule) => rule.row.name),
  );
}

const PLACED_TRIGGERS: ReadonlySet<string> = new Set(['sun', 'weather', 'weather_kind']);
const PLACED_CONDITIONS: ReadonlySet<string> = new Set(['weather', 'weather_kind', 'daylight']);

function usesSun(rules: readonly RuleView[]): boolean {
  return rules.some(
    (rule) =>
      rule.definition?.triggers.some((trigger) => PLACED_TRIGGERS.has(trigger.type)) === true ||
      rule.definition?.conditions.items.some((item) => PLACED_CONDITIONS.has(item.type)) === true,
  );
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
  const rules = useRules(catalog.names);
  const reading = usePlaceReading();
  return {
    catalog,
    rules,
    reading,
    ideas: ideasFor(catalog, rules),
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
