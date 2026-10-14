import { ASSISTANT_MESSAGE_ROW } from '@smarteverything/domain';
import { storedRow } from '../codec';
import { UNKNOWN_COST_SQL } from '../../ledger/usage-queries';

export const STORED_MESSAGE = storedRow(ASSISTANT_MESSAGE_ROW, {
  json: ['attachments', 'references', 'steps', 'step_states', 'origin', 'embeds'],
  flags: ['cost_incomplete'],
});

export const STORED_MESSAGE_COLUMNS =
  'id, profile_id, client_id, role, kind, author, text, attachments, references_json, state, reason, reason_code, client_message_id, steps, step_states, reply_to, chat_id, origin, embeds, cost_micros, model, created_at, updated_at';

export const MESSAGE_COLUMNS = `${STORED_MESSAGE_COLUMNS.replace('references_json', 'references_json as "references"')},
  exists(select 1 from ai_usage where message_id = assistant_messages.id and ${UNKNOWN_COST_SQL}) as cost_incomplete`;
