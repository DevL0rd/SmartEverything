import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { jsonText, type Sql } from '../sql';
import type { Migration } from './migration';

export const REMOVED_PREVIEW_TOOLS: readonly string[] = [
  'preview_read',
  'preview_edit',
  'preview_logs_read',
  'preview_capture',
];
const TEXT_ROW = z.object({ id: z.string(), text: z.string() });
const NAMES = z.array(z.string());

function kept(text: string): string {
  return jsonText(
    NAMES.parse(JSON.parse(text)).filter((name) => !REMOVED_PREVIEW_TOOLS.includes(name)),
  );
}

export function dropPreviewReferences(sql: Sql): LogPayload {
  const settings = sql.all(TEXT_ROW, "select '1' as id, mcp_disabled_tools as text from settings");
  for (const row of settings)
    sql.run('drop removed preview tools from switched-off tools', 'update settings set mcp_disabled_tools = $names', {
      names: kept(row.text),
    });
  const chats = sql.all(TEXT_ROW, 'select id, tools as text from ai_chats where tools is not null');
  for (const row of chats)
    sql.run('drop removed preview tools from a chat tool grant', 'update ai_chats set tools = $names where id = $id', {
      id: row.id,
      names: kept(row.text),
    });
  return { settings: settings.length, chats: chats.length };
}

export const DROP_PREVIEWS_MIGRATION: Migration = {
  version: 138,
  name: 'drop_previews',
  statements: ['drop table ai_preview_projects', 'drop table preview_error_rules'],
  backfill: dropPreviewReferences,
};
