import { z } from 'zod';
import { createHash } from 'node:crypto';
import { CLAUDE_CLI_RECEIPT, ApiError, type ClaudeCliReceipt } from '@smarteverything/domain';
import type { StoreContext } from '../context';
import { found } from '../context';
import { SQL_JSON, jsonText } from '../sql';
import { durableSessionWrite } from './dsh-session-durability';

const BINDING = z.strictObject({
  chat_id: z.uuid(),
  profile_id: z.uuid(),
  device_id: z.uuid(),
  cwd: z.string(),
});
const OPERATION = z.strictObject({
  request: z.string(),
  receipt: SQL_JSON.pipe(CLAUDE_CLI_RECEIPT),
});
export type ClaudeCliBinding = z.infer<typeof BINDING>;

export class ClaudeCliOperationsRepository {
  constructor(private readonly context: StoreContext) {}
  timestamp(): string {
    return this.context.now();
  }
  bind(binding: ClaudeCliBinding): void {
    this.context.sql.run(
      'bind a managed Claude CLI chat',
      'insert into claude_cli_chats(chat_id,profile_id,device_id,cwd) values($chat_id,$profile_id,$device_id,$cwd)',
      BINDING.parse(binding),
    );
  }
  binding(chatId: string): ClaudeCliBinding {
    return found(
      this.context.sql.get(BINDING, 'select * from claude_cli_chats where chat_id=$chat', {
        chat: chatId,
      }),
      'managed Claude CLI chat',
      chatId,
    );
  }
  list(profileId: string, deviceId: string): ClaudeCliBinding[] {
    return this.context.sql.all(
      BINDING,
      'select * from claude_cli_chats where profile_id=$profile and device_id=$device',
      { profile: profileId, device: deviceId },
    );
  }
  known(
    operationId: string,
    profileId: string,
    deviceId: string,
    request: string,
  ): ClaudeCliReceipt | undefined {
    const row = this.row(operationId);
    if (row === undefined) return undefined;
    this.assertOwner(row.receipt, profileId, deviceId);
    if (row.request !== createHash('sha256').update(request).digest('hex'))
      throw new ApiError('conflict', 'The CLI operation ID was reused with different input.');
    return row.receipt;
  }
  read(operationId: string, profileId: string, deviceId: string): ClaudeCliReceipt {
    const row = found(this.row(operationId), 'Claude CLI operation', operationId);
    this.assertOwner(row.receipt, profileId, deviceId);
    return row.receipt;
  }
  reserve(receipt: ClaudeCliReceipt, request: string): void {
    this.context.sql.run(
      'persist the CLI receipt before delivery',
      'insert into claude_cli_operations(operation_id,profile_id,device_id,chat_id,request,receipt) values($operation,$profile,$device,$chat,$request,$receipt)',
      {
        operation: receipt.operation_id,
        profile: receipt.profile_id,
        device: receipt.device_id,
        chat: receipt.chat_id,
        request: createHash('sha256').update(request).digest('hex'),
        receipt: jsonText(CLAUDE_CLI_RECEIPT.parse(receipt)),
      },
    );
  }
  save(receipt: ClaudeCliReceipt): ClaudeCliReceipt {
    const parsed = CLAUDE_CLI_RECEIPT.parse({ ...receipt, updated_at: this.context.now() });
    durableSessionWrite(this.context, () =>
      this.context.sql.run(
        'retain the CLI operation outcome',
        'update claude_cli_operations set receipt=$receipt where operation_id=$operation',
        { operation: parsed.operation_id, receipt: jsonText(parsed) },
      ),
    );
    return parsed;
  }
  recover(): void {
    const rows = this.context.sql.all(
      OPERATION,
      "select request,receipt from claude_cli_operations where json_extract(receipt,'$.state')='pending'",
    );
    for (const row of rows)
      this.save({
        ...row.receipt,
        state: 'unknown',
        reason:
          'The hub restarted before acknowledging this operation. It will never be repeated automatically.',
      });
  }
  private row(operationId: string): z.infer<typeof OPERATION> | undefined {
    return this.context.sql.get(
      OPERATION,
      'select request,receipt from claude_cli_operations where operation_id=$operation',
      { operation: operationId },
    );
  }
  private assertOwner(receipt: ClaudeCliReceipt, profileId: string, deviceId: string): void {
    if (receipt.profile_id !== profileId || receipt.device_id !== deviceId)
      throw new ApiError('forbidden', 'This CLI operation belongs to another profile or computer.');
  }
}
