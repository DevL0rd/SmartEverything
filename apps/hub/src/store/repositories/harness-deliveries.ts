import { z } from 'zod';
import type { StoreContext } from '../context';
import { durableSessionWrite } from './dsh-session-durability';

const DELIVERY = z.strictObject({
  delivery_id: z.uuid(),
  session_id: z.string().min(1),
  reply_id: z.uuid().nullable(),
  state: z.enum(['admitted', 'completed', 'unknown']),
  start_seq: z.int().nonnegative().nullable(),
  end_seq: z.int().min(-1).nullable(),
});
export type HarnessDelivery = z.infer<typeof DELIVERY>;
export class HarnessDeliveriesRepository {
  constructor(private readonly context: StoreContext) {}
  find(id: string): HarnessDelivery | undefined {
    return this.context.sql.get(
      DELIVERY,
      'select delivery_id,session_id,reply_id,state,start_seq,end_seq from harness_deliveries where delivery_id=$id',
      { id },
    );
  }
  unsettled(): HarnessDelivery[] {
    return this.context.sql.all(
      DELIVERY,
      "select delivery_id,session_id,reply_id,state,start_seq,end_seq from harness_deliveries where state in ('admitted','unknown') order by rowid",
    );
  }
  restorePending(id: string, project: () => void): void {
    durableSessionWrite(this.context, () => {
      this.context.sql.run(
        'restore provably unclaimed native delivery',
        "update harness_deliveries set state='admitted' where delivery_id=$id",
        { id },
      );
      this.context.sql.run(
        'retain pending native input completion',
        'update assistant_events set answered_at=null where id=$id',
        { id },
      );
      project();
    });
  }
  pending(sessionId?: string): HarnessDelivery[] {
    return this.context.sql.all(
      DELIVERY,
      "select delivery_id,session_id,reply_id,state,start_seq,end_seq from harness_deliveries where ($id is null or session_id=$id) and state='admitted' order by rowid",
      { id: sessionId ?? null },
    );
  }
  cutOfMessage(id: string): HarnessDelivery | undefined {
    return this.context.sql.get(
      DELIVERY,
      'select d.delivery_id,d.session_id,d.reply_id,d.state,d.start_seq,d.end_seq from harness_deliveries d join assistant_events e on e.id=d.delivery_id where d.reply_id=$id or e.message_id=$id order by e.cursor desc limit 1',
      { id },
    );
  }
  cut(id: string, start: number, end: number | null = null): void {
    this.context.sql.run(
      'retain native delivery history boundary',
      'update harness_deliveries set start_seq=coalesce(start_seq,$start),end_seq=$end where delivery_id=$id',
      { id, start, end },
    );
  }
  admit(id: string, sessionId: string, reply: () => string): HarnessDelivery {
    return durableSessionWrite(this.context, () => {
      const existing = this.find(id);
      if (existing !== undefined) return existing;
      const replyId = reply();
      this.context.sql.run(
        'admit native conversation delivery once',
        "insert into harness_deliveries(delivery_id,session_id,reply_id,state) values($id,$session,$reply,'admitted')",
        { id, session: sessionId, reply: replyId },
      );
      return DELIVERY.parse({
        delivery_id: id,
        session_id: sessionId,
        reply_id: replyId,
        state: 'admitted',
        start_seq: null,
        end_seq: null,
      });
    });
  }
  update(id: string, state: HarnessDelivery['state'], project: () => void): void {
    durableSessionWrite(this.context, () => {
      this.context.sql.run(
        'persist native conversation delivery outcome',
        'update harness_deliveries set state=$state where delivery_id=$id',
        { id, state },
      );
      project();
    });
  }
}
