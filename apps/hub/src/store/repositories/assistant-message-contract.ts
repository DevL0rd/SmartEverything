import type { AssistantMessageRow } from '@smarteverything/domain';

export type NewAssistantMessage = Omit<
  AssistantMessageRow,
  'id' | 'created_at' | 'updated_at' | 'reason_code' | 'client_message_id'
> &
  Partial<Pick<AssistantMessageRow, 'client_message_id' | 'reason_code'>>;

export type AssistantMessageChange = Partial<
  Pick<
    AssistantMessageRow,
    | 'state'
    | 'reason'
    | 'reason_code'
    | 'steps'
    | 'step_states'
    | 'text'
    | 'model'
    | 'embeds'
    | 'attachments'
    | 'references'
  >
>;
