import { currentToolCall, isMcpToolName } from '@smarteverything/domain';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { storedRow } from '../codec';
import { jsonText, type Sql } from '../sql';

const DISABLED = storedRow(z.strictObject({ disabled: z.array(z.string()) }), {
  json: ['disabled'],
});

export function renameRetiredDisabledTools(sql: Sql): LogPayload {
  const row = sql.get(DISABLED, 'select mcp_disabled_tools as disabled from settings where id = 1');
  if (row === undefined) {
    return { disabled: 0 };
  }
  const disabled = new Set(
    row.disabled.map((name) => currentToolCall(name, {}).name).filter(isMcpToolName),
  );
  sql.run(
    'rename the switched-off tools',
    'update settings set mcp_disabled_tools = $disabled where id = 1',
    { disabled: jsonText([...disabled]) },
  );
  return { disabled: disabled.size };
}
