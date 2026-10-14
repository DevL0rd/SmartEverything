import { z } from 'zod';
import type { StoreContext } from '../context';
import { durableSessionWrite } from './dsh-session-durability';
const CHILD = z.strictObject({
  operation_id: z.uuid(),
  parent_session: z.string(),
  child_session: z.string(),
  run_id: z.uuid(),
  delivery_id: z.uuid(),
  state: z.enum(['running', 'completed', 'failed', 'unknown']),
  result: z.string().nullable(),
  delivered: z.int().min(0).max(1),
});
export type HarnessChild = z.infer<typeof CHILD>;
export class HarnessChildrenRepository {
  constructor(private readonly context: StoreContext) {}
  find(operation: string): HarnessChild | undefined {
    return this.context.sql.get(CHILD, 'select * from harness_children where operation_id=$id', {
      id: operation,
    });
  }
  keep(input: HarnessChild): void {
    const child = CHILD.parse(input);
    durableSessionWrite(this.context, () =>
      this.context.sql.run(
        'retain admitted native child lineage',
        'insert into harness_children(operation_id,parent_session,child_session,run_id,delivery_id,state,result,delivered) values($id,$parent,$child,$run,$delivery,$state,$result,$delivered) on conflict(operation_id) do nothing',
        {
          id: child.operation_id,
          parent: child.parent_session,
          child: child.child_session,
          run: child.run_id,
          delivery: child.delivery_id,
          state: child.state,
          result: child.result,
          delivered: child.delivered,
        },
      ),
    );
  }
  finish(operation: string, state: HarnessChild['state'], result: string): void {
    this.context.sql.run(
      'retain native child terminal result',
      'update harness_children set state=$state,result=$result where operation_id=$id',
      { id: operation, state, result },
    );
  }
  delivered(operation: string): void {
    this.context.sql.run(
      'acknowledge native child parent mailbox',
      'update harness_children set delivered=1 where operation_id=$id',
      { id: operation },
    );
  }
}
