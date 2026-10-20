import type {
  PluginRow,
  PluginUiRow,
  RowOperation,
  WidgetBody,
  WidgetControl,
} from '@smarteverything/domain';
import { isDeepStrictEqual } from 'node:util';

function controlsOf(body: WidgetBody): readonly WidgetControl[] {
  return body.type === 'controls' ? body.items : [];
}

function switchedOff(row: PluginRow): string[] {
  const { widgets, pages } = row.manifest.contributes;
  const bodies = [
    ...widgets.map((widget) => widget.body),
    ...pages.flatMap((page) => page.sections.map((section) => section.body)),
  ];
  const tools = bodies
    .flatMap(controlsOf)
    .map((control) => control.tool)
    .filter((tool) => row.tool_switches[tool] === false);
  return [...new Set(tools)].sort();
}

export function pluginUiOf(row: PluginRow | null): PluginUiRow | null {
  if (row?.enabled !== true) return null;
  const { contributes, name } = row.manifest;
  return {
    id: row.id,
    name,
    icon_url: row.icon_url,
    widgets: contributes.widgets,
    pages: contributes.pages,
    tools_off: switchedOff(row),
  };
}

export interface PluginUiChange {
  readonly operation: RowOperation;
  readonly record: PluginUiRow | null;
  readonly oldRecord: PluginUiRow | null;
}

export function pluginUiChange(
  before: PluginRow | null,
  after: PluginRow | null,
): PluginUiChange | null {
  const oldRecord = pluginUiOf(before);
  const record = pluginUiOf(after);
  if (oldRecord === null && record === null) return null;
  if (oldRecord === null) return { operation: 'INSERT', record, oldRecord };
  if (record === null) return { operation: 'DELETE', record, oldRecord };
  if (isDeepStrictEqual(oldRecord, record)) return null;
  return { operation: 'UPDATE', record, oldRecord };
}
