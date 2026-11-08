import { ASSISTANT_MESSAGE_ROW, HELPER_DIALOGUE_KIND } from '@smarteverything/domain';
import { storedRow } from '../codec';
import { UNKNOWN_COST_SQL } from '../../ledger/usage-queries';

const MESSAGE_JSON_COLUMNS = [
  'attachments',
  'references',
  'steps',
  'step_states',
  'origin',
  'embeds',
  'quote',
];
const MESSAGE_FLAG_COLUMNS = ['cost_incomplete'];

export const STORED_MESSAGE = storedRow(ASSISTANT_MESSAGE_ROW, {
  json: MESSAGE_JSON_COLUMNS,
  flags: MESSAGE_FLAG_COLUMNS,
});

export const STORED_REACTED_MESSAGE = storedRow(ASSISTANT_MESSAGE_ROW, {
  json: [...MESSAGE_JSON_COLUMNS, 'reactions'],
  flags: MESSAGE_FLAG_COLUMNS,
});

export const STORED_MESSAGE_COLUMNS =
  'id, profile_id, client_id, role, kind, author, text, attachments, references_json, state, reason, reason_code, client_message_id, steps, step_states, reply_to, quote, chat_id, origin, embeds, cost_micros, model, created_at, updated_at';

export const MESSAGE_COLUMNS = `${STORED_MESSAGE_COLUMNS.replace('references_json', 'references_json as "references"')},
  exists(select 1 from ai_usage where message_id = assistant_messages.id and ${UNKNOWN_COST_SQL}) as cost_incomplete`;

export const REACTED_MESSAGE_COLUMNS = `${MESSAGE_COLUMNS},
  (select json_group_array(json_object(
    'emoji', emoji, 'actor', json_object('kind', actor_kind, 'id', actor_id, 'label', actor_label)
  ) order by rowid) from assistant_reactions where message_id = assistant_messages.id) as reactions`;

export const COORDINATOR_MESSAGE_SQL = `not exists (
  select 1 from json_each(assistant_messages.embeds) where json_extract(value, '$.kind') = '${HELPER_DIALOGUE_KIND}'
)`;
