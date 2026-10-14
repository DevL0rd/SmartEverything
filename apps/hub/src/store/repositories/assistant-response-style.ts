import {
  ASSISTANT_RESPONSE_STYLE,
  DEFAULT_RESPONSE_STYLE,
  type AssistantResponseStyle,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import { jsonText } from '../sql';
const KEY = 'assistant-response-style';
const ROW = storedRow(z.object({ settings: ASSISTANT_RESPONSE_STYLE }), { json: ['settings'] });
export function readResponseStyle(context: StoreContext): AssistantResponseStyle {
  return (
    context.sql.get(ROW, 'select settings from ai_settings where key = $key', { key: KEY })
      ?.settings ?? DEFAULT_RESPONSE_STYLE
  );
}
export function saveResponseStyle(context: StoreContext, style: AssistantResponseStyle): void {
  context.sql.run(
    'save the assistant response style',
    'insert into ai_settings (key,settings,updated_at) values ($key,$settings,$now) on conflict(key) do update set settings=excluded.settings,updated_at=excluded.updated_at',
    { key: KEY, settings: jsonText(ASSISTANT_RESPONSE_STYLE.parse(style)), now: context.now() },
  );
}
