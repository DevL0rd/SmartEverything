import { CHANNEL_OPERATIONS } from './channels';
import { GUILD_OPERATIONS } from './guilds';
import { MEMBER_OPERATIONS } from './members';
import { MESSAGE_OPERATIONS } from './messages';
import { SCHEDULED_OPERATIONS } from './scheduled';
import type { Operation, OperationMode } from './kit';

const OPERATIONS: readonly Operation[] = [
  ...MESSAGE_OPERATIONS,
  ...CHANNEL_OPERATIONS,
  ...MEMBER_OPERATIONS,
  ...GUILD_OPERATIONS,
  ...SCHEDULED_OPERATIONS,
];

export function operationsOf(mode: OperationMode): readonly Operation[] {
  return OPERATIONS.filter((operation) => operation.mode === mode);
}
