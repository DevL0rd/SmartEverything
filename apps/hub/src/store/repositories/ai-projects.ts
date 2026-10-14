import { z } from 'zod';
import { ApiError } from '@smarteverything/domain';
import { found, type StoreContext } from '../context';
const PROJECT = z.strictObject({
  chat_id: z.uuid(),
  profile_id: z.uuid(),
  root_identity: z.string().nullable(),
  revision: z.uuid(),
  updated_at: z.string(),
});
const RECEIPT = z.strictObject({
  request_hash: z.string(),
  state: z.enum(['pending', 'complete']),
  result_path: z.string(),
});
export type ManagedProject = z.output<typeof PROJECT>;
export class AiProjectsRepository {
  constructor(private readonly context: StoreContext) {}
  find(chat: string): ManagedProject | undefined {
    return this.context.sql.get(PROJECT, 'select * from ai_projects where chat_id=$chat', { chat });
  }
  ensure(chat: string, profile: string): ManagedProject {
    this.context.write(() => {
      this.context.sql.run(
        'register central chat project',
        'insert into ai_projects(chat_id,profile_id,revision,updated_at) values($chat,$profile,$revision,$now) on conflict(chat_id) do nothing',
        { chat, profile, revision: this.context.newId(), now: this.context.now() },
      );
    });
    const project = found(this.find(chat), 'managed chat project', chat);
    if (project.profile_id !== profile)
      throw new ApiError('forbidden', 'The project belongs to a different profile.');
    return project;
  }
  identify(chat: string, identity: string): void {
    this.context.write(() =>
      this.context.sql.run(
        'record managed root identity',
        'update ai_projects set root_identity=$identity where chat_id=$chat and root_identity is null',
        { chat, identity },
      ),
    );
  }
  changed(chat: string): void {
    this.context.write(() =>
      this.context.sql.run(
        'record committed managed project change',
        'update ai_projects set revision=$revision,updated_at=$now where chat_id=$chat',
        { chat, revision: this.context.newId(), now: this.context.now() },
      ),
    );
  }
  receipt(chat: string, operation: string): z.output<typeof RECEIPT> | undefined {
    return this.context.sql.get(
      RECEIPT,
      'select request_hash,state,result_path from ai_project_receipts where chat_id=$chat and operation_id=$operation',
      { chat, operation },
    );
  }
  begin(chat: string, operation: string, hash: string, path: string): void {
    this.context.write(() =>
      this.context.sql.run(
        'admit managed project mutation',
        "insert into ai_project_receipts(chat_id,operation_id,request_hash,state,result_path) values($chat,$operation,$hash,'pending',$path)",
        { chat, operation, hash, path },
      ),
    );
  }
  complete(chat: string, operation: string): void {
    this.context.write(() =>
      this.context.sql.run(
        'complete managed project mutation receipt',
        "update ai_project_receipts set state='complete' where chat_id=$chat and operation_id=$operation",
        { chat, operation },
      ),
    );
  }
}
