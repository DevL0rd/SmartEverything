import { z } from 'zod';
import {
  ApiError,
  AI_NATIVE_COMMAND_RECEIPT,
  type AiNativeCommandReceipt,
  type AiNativeCommandWrite,
} from '@smarteverything/domain';
import { canonicalRuntimeInput } from '../../computers/runtime-receipts';
import { SQL_JSON, jsonText } from '../sql';
import type { StoreContext } from '../context';
import { found } from '../context';
import { durableSessionWrite } from './dsh-session-durability';

const ROW = z.strictObject({
  request: z.string(),
  receipt: SQL_JSON.pipe(AI_NATIVE_COMMAND_RECEIPT),
});
export class NativeCommandOperationsRepository {
  constructor(private readonly context: StoreContext) {}
  known(input: AiNativeCommandWrite): AiNativeCommandReceipt | undefined {
    const row = this.row(input.operation_id);
    if (row === undefined) return undefined;
    if (row.request !== canonicalRuntimeInput(input))
      throw new ApiError('conflict', 'This command operation ID identifies different input.');
    return row.receipt;
  }
  assertJobAvailable(input: AiNativeCommandWrite): void {
    const existing = this.context.sql.get(
      ROW,
      "select request,receipt from native_command_operations where json_extract(receipt,'$.scope.device_id')=$device and json_extract(receipt,'$.scope.runtime')=$runtime and json_extract(receipt,'$.command_job_id')=$job limit 1",
      { device: input.scope.device_id, runtime: input.scope.runtime, job: input.command_job_id },
    );
    if (existing !== undefined || input.command_job_id === input.scope.job_id)
      throw new ApiError('conflict', 'The native command requires a never-submitted fresh job ID.');
  }
  unknownForChat(chatId: string): AiNativeCommandReceipt[] {
    return this.unknown('$.scope.chat_id', chatId);
  }
  unknownRuntime(runtime: AiNativeCommandReceipt['scope']['runtime']): AiNativeCommandReceipt[] {
    return this.unknown('$.scope.runtime', runtime);
  }
  private unknown(
    path: '$.scope.chat_id' | '$.scope.runtime',
    id: string,
  ): AiNativeCommandReceipt[] {
    return this.context.sql
      .all(
        ROW,
        "select request,receipt from native_command_operations where json_extract(receipt,$path)=$id and json_extract(receipt,'$.status')='unknown'",
        { path, id },
      )
      .map((row) => row.receipt);
  }
  read(id: string): AiNativeCommandReceipt {
    return found(this.row(id), 'native command receipt', id).receipt;
  }
  reserve(input: AiNativeCommandWrite, receipt: AiNativeCommandReceipt): void {
    const parsed = AI_NATIVE_COMMAND_RECEIPT.parse(receipt);
    if (
      canonicalRuntimeInput(identity(parsed)) !==
      canonicalRuntimeInput([
        input.operation_id,
        input.scope,
        input.command_job_id,
        input.definition_id,
      ])
    )
      throw new ApiError('conflict', 'The command receipt identifies a different operation.');
    durableSessionWrite(this.context, () =>
      this.context.sql.run(
        'retain native command admission before dispatch',
        'insert into native_command_operations(operation_id,request,receipt) values($id,$request,$receipt)',
        {
          id: input.operation_id,
          request: canonicalRuntimeInput(input),
          receipt: jsonText(parsed),
        },
      ),
    );
  }
  save(receipt: AiNativeCommandReceipt): AiNativeCommandReceipt {
    const parsed = AI_NATIVE_COMMAND_RECEIPT.parse(receipt);
    const previous = this.read(parsed.operation_id);
    if (canonicalRuntimeInput(identity(previous)) !== canonicalRuntimeInput(identity(parsed)))
      throw new ApiError('conflict', 'The command receipt changed its admitted identity.');
    if (!['pending', 'running'].includes(previous.status)) return previous;
    if (olderObservation(previous, parsed)) return previous;
    durableSessionWrite(this.context, () =>
      this.context.sql.run(
        'retain native command outcome',
        'update native_command_operations set receipt=$receipt where operation_id=$id',
        { id: parsed.operation_id, receipt: jsonText(parsed) },
      ),
    );
    return parsed;
  }
  active(chatId: string): AiNativeCommandReceipt[] {
    return this.context.sql
      .all(
        ROW,
        "select request,receipt from native_command_operations where json_extract(receipt,'$.scope.chat_id')=$chat and json_extract(receipt,'$.status') in ('pending','running')",
        { chat: chatId },
      )
      .map((row) => row.receipt);
  }
  activeRuntime(runtime: AiNativeCommandReceipt['scope']['runtime']): AiNativeCommandReceipt[] {
    return this.context.sql
      .all(
        ROW,
        "select request,receipt from native_command_operations where json_extract(receipt,'$.scope.runtime')=$runtime and json_extract(receipt,'$.status') in ('pending','running')",
        { runtime },
      )
      .map((row) => row.receipt);
  }
  recover(runtime: AiNativeCommandReceipt['scope']['runtime']): void {
    const rows = this.context.sql.all(
      ROW,
      "select request,receipt from native_command_operations where json_extract(receipt,'$.scope.runtime')=$runtime and json_extract(receipt,'$.status') in ('pending','running')",
      { runtime },
    );
    for (const row of rows)
      this.save({
        ...row.receipt,
        status: 'unknown',
        outcome: null,
        text: 'The hub restarted before command settlement; this operation will never be replayed.',
      });
  }
  private row(id: string): z.infer<typeof ROW> | undefined {
    return this.context.sql.get(
      ROW,
      'select request,receipt from native_command_operations where operation_id=$id',
      { id },
    );
  }
}
function identity(receipt: AiNativeCommandReceipt): readonly unknown[] {
  return [receipt.operation_id, receipt.scope, receipt.command_job_id, receipt.definition_id];
}

function olderObservation(previous: AiNativeCommandReceipt, next: AiNativeCommandReceipt): boolean {
  if (next.status === 'unknown' || next.status === 'rejected') return false;
  if (previous.source_event_seq === null) return false;
  return next.source_event_seq === null || next.source_event_seq < previous.source_event_seq;
}
