import {
  ApiError,
  IMAGE_OPERATION_RECEIPT,
  IMAGE_OPERATION_REQUEST_READ,
  type ImageOperationReceipt,
  type ImageOperationRequest,
  type ImageSelector,
} from '@smarteverything/domain';
import { z } from 'zod';
import { found, type StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';
import { FILE_COLUMNS, STORED_FILE, type StoredAttachment } from './assistant-files';

const ROW = z.strictObject({
  actor_key: z.string(),
  request: SQL_JSON.pipe(IMAGE_OPERATION_REQUEST_READ),
  receipt: SQL_JSON.pipe(IMAGE_OPERATION_RECEIPT),
});
export class ImageOperationsRepository {
  constructor(private readonly context: StoreContext) {}
  find(id: string): z.infer<typeof ROW> | undefined {
    return this.context.sql.get(
      ROW,
      'select actor_key,request,receipt from image_operations where id=$id',
      { id },
    );
  }
  read(id: string): ImageOperationReceipt {
    return this.resultAvailability(found(this.find(id), 'image operation', id).receipt);
  }
  replay(actorKey: string, request: ImageOperationRequest): ImageOperationReceipt | undefined {
    const prior = this.find(request.operation_id);
    if (prior === undefined) return undefined;
    if (prior.actor_key !== actorKey || jsonText(prior.request) !== jsonText(request))
      throw new ApiError(
        'conflict',
        'This image operation ID was already used for a different request or actor.',
      );
    return this.resultAvailability(prior.receipt);
  }
  list(chatId: string): ImageOperationReceipt[] {
    return this.context.sql
      .all(
        z.strictObject({ receipt: SQL_JSON.pipe(IMAGE_OPERATION_RECEIPT) }),
        'select receipt from image_operations where chat_id=$chat order by sequence desc limit 100',
        { chat: chatId },
      )
      .map((row) => this.resultAvailability(row.receipt));
  }
  reserve(actorKey: string, receipt: ImageOperationReceipt): ImageOperationReceipt {
    return this.context.write(() => {
      const reserved = { ...receipt, result_message_id: this.context.newId() };
      this.context.sql.run(
        'reserve the image operation',
        `insert into image_operations
        (id,profile_id,chat_id,actor_key,request,receipt,state,created_at,updated_at)
        values ($id,$profile,$chat,$actor,$request,$receipt,$state,$now,$now)`,
        {
          id: receipt.id,
          profile: receipt.profile_id,
          chat: receipt.chat_id,
          actor: actorKey,
          request: jsonText(receipt.request),
          receipt: jsonText(reserved),
          state: receipt.state,
          now: receipt.created_at,
        },
      );
      return reserved;
    });
  }
  private resultAvailability(receipt: ImageOperationReceipt): ImageOperationReceipt {
    if (receipt.state !== 'completed' || receipt.message_id === null) return receipt;
    const row = this.context.sql.get(
      z.strictObject({ present: z.int().min(0).max(1) }),
      'select exists(select 1 from assistant_messages where id=$message) as present',
      { message: receipt.message_id },
    );
    return {
      ...receipt,
      result_message_id: receipt.message_id,
      message_deleted: found(row, 'image result availability', receipt.id).present === 0,
    };
  }
  update(receipt: ImageOperationReceipt): ImageOperationReceipt {
    return this.context.write(() => {
      const prior = this.read(receipt.id);
      if (prior.state !== 'reserved' && prior.state !== 'running')
        throw new ApiError('conflict', 'This image operation already has a terminal receipt.');
      const next = IMAGE_OPERATION_RECEIPT.parse({
        ...receipt,
        updated_at: this.context.now(),
      });
      this.context.sql.run(
        'update the image receipt',
        'update image_operations set receipt=$receipt,state=$state,updated_at=$now where id=$id',
        { id: next.id, receipt: jsonText(next), state: next.state, now: next.updated_at },
      );
      for (const [position, artifact] of next.results.entries()) {
        this.context.sql.run(
          'keep immutable image lineage',
          `insert into image_artifacts
          (attachment_id,operation_id,position,lineage) values ($attachment,$operation,$position,$lineage)`,
          {
            attachment: artifact.attachment.id,
            operation: next.id,
            position,
            lineage: jsonText(artifact.parents),
          },
        );
      }
      return next;
    });
  }
  resolve(chatId: string, profileId: string, selector: ImageSelector): StoredAttachment {
    const filter =
      selector.kind === 'attachment'
        ? 'f.id=$id'
        : "($origin='any' or ($origin='generated' and a.attachment_id is not null) or ($origin='uploaded' and a.attachment_id is null))";
    const row = this.context.sql.get(
      STORED_FILE,
      `select ${FILE_COLUMNS.split(', ')
        .map((column) => `f.${column}`)
        .join(', ')}
       from assistant_attachments f join assistant_messages m on m.id=f.message_id
       left join image_artifacts a on a.attachment_id=f.id
       left join image_operations o on o.id=a.operation_id
       where m.chat_id=$chat and f.profile_id=$profile and m.state is not 'failed'
         and f.mime in ('image/png','image/jpeg','image/webp') and (a.attachment_id is null or o.state='completed')
         and ${filter} order by m.created_at desc,m.rowid desc,f.rowid desc limit 1`,
      {
        chat: chatId,
        profile: profileId,
        ...(selector.kind === 'attachment'
          ? { id: selector.attachment_id }
          : { origin: selector.origin }),
      },
    );
    if (row === undefined)
      throw new ApiError('not_found', 'This chat has no image to use: source and references need an image already in this chat (an upload or an earlier result) or an attachmentId from chat_read view messages; use generate to make a new one.');
    return row;
  }
  recover(record?: (receipt: ImageOperationReceipt) => ImageOperationReceipt): void {
    for (const row of this.context.sql.all(
      ROW,
      "select actor_key,request,receipt from image_operations where state in ('reserved','running')",
    )) {
      this.context.write(() => {
        const unknown: ImageOperationReceipt = {
          ...row.receipt,
          state: 'unknown',
          reason: 'The hub restarted before this operation reached a terminal receipt.',
        };
        this.update(record === undefined ? unknown : record(unknown));
      });
    }
  }
}
