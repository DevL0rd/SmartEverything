import {
  CHAT_LINK_VALUE_MAX,
  LINK_ARGUMENT_SKIPPED,
  SETTING_LINK_TOOLS,
  type ChatWidget,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { RuleInput, WidgetRule } from './rule-input';

const ID = z.uuid();
const CREATED = z.looseObject({ result: z.looseObject({ id: ID }) });

type Entity = 'automation_link' | 'scene_link' | 'room_link' | 'scheduled_link';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function childPath(path: string, key: string): string {
  if (path !== '') {
    return `${path}.${key}`;
  }
  return key === 'body' ? '' : key;
}

function leaves(value: unknown, path: string): [string, unknown][] {
  if (!isRecord(value)) {
    return [[path, value]];
  }
  return Object.entries(value).flatMap(([key, entry]) =>
    LINK_ARGUMENT_SKIPPED.has(key) || key.endsWith('Id') ? [] : leaves(entry, childPath(path, key)),
  );
}

function changedFields(args: RuleInput['args']): [string, unknown][] {
  return leaves(args, '');
}

export function valueText(value: unknown): string | null {
  if (typeof value === 'boolean') {
    return value ? 'On' : 'Off';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length > CHAT_LINK_VALUE_MAX ? `${text.slice(0, CHAT_LINK_VALUE_MAX - 1)}…` : text;
}

function onlyValue(fields: readonly [string, unknown][]): string | null {
  const [only] = fields;
  return fields.length === 1 && only !== undefined ? valueText(only[1]) : null;
}

function settingLinks(name: string): WidgetRule['widgets'] {
  return ({ args }) => {
    const target = SETTING_LINK_TOOLS[name];
    if (target === undefined) {
      return [];
    }
    const fields = changedFields(args);
    const mapped = fields.find(([field]) => target.fields[field] !== undefined);
    if (mapped !== undefined) {
      const setting = target.fields[mapped[0]] ?? target.page;
      return [{ kind: 'setting_link', setting, value: valueText(mapped[1]) }];
    }
    return [{ kind: 'setting_link', setting: target.page, value: onlyValue(fields) }];
  };
}

function idOf(input: RuleInput, key: string): string | null {
  const given = ID.safeParse(input.args[key]);
  if (given.success) {
    return given.data;
  }
  const created = CREATED.safeParse(input.output);
  return created.success ? created.data.result.id : null;
}

function entityLink(kind: Entity, key: string): WidgetRule['widgets'] {
  return (input) => {
    const id = idOf(input, key);
    return id === null ? [] : [{ kind, id, value: onlyValue(changedFields(input.args)) }];
  };
}

function deviceSettingsLink(input: RuleInput): ChatWidget[] {
  const id = ID.safeParse(input.args['deviceId']);
  return id.success
    ? [{ kind: 'device_settings_link', id: id.data, value: onlyValue(changedFields(input.args)) }]
    : [];
}

export const LINK_RULES: readonly WidgetRule[] = [
  ...Object.keys(SETTING_LINK_TOOLS).map((name) => ({
    tools: [name],
    widgets: settingLinks(name),
  })),
  {
    tools: ['update_device', 'update_camera'],
    widgets: deviceSettingsLink,
  },
  {
    tools: ['create_automation', 'update_automation'],
    widgets: entityLink('automation_link', 'automationId'),
  },
  {
    tools: ['run_scene', 'create_scene', 'update_scene'],
    widgets: entityLink('scene_link', 'sceneId'),
  },
  { tools: ['create_room', 'update_room'], widgets: entityLink('room_link', 'roomId') },
  {
    tools: ['update_scheduled'],
    widgets: entityLink('scheduled_link', 'scheduleId'),
  },
];
