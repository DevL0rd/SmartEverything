import { z } from 'zod';
import { JSON_VALUE } from '@smarteverything/domain';
import { storedRow } from '../codec';
import { moment, type StoreContext } from '../context';
import { jsonText } from '../sql';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

const NODE_STATE_ROW = z.strictObject({
  automation_id: ID,
  node_id: z.string().min(1),
  partition: z.string(),
  state: JSON_VALUE,
  wake_at: MOMENT.nullable(),
  updated_at: MOMENT,
});

export type NodeStateRow = z.infer<typeof NODE_STATE_ROW>;

const STORED_STATE = storedRow(NODE_STATE_ROW, { json: ['state'] });
const COLUMNS = Object.keys(NODE_STATE_ROW.shape).join(',');

const NEXT_WAKE = z.strictObject({ wake_at: MOMENT.nullable() });

export interface SlotKind {
  readonly partition: string;
  readonly prefix: string;
}

export interface NodeStateWrite {
  readonly automationId: string;
  readonly nodeId: string;
  readonly partition?: string;
  readonly state: unknown;
  readonly wakeAt?: string | null;
}

export class AutomationNodeStateRepository {
  constructor(private readonly context: StoreContext) {}

  get(automationId: string, nodeId: string, partition = ''): NodeStateRow | undefined {
    return this.context.sql.get(
      STORED_STATE,
      `select ${COLUMNS} from automation_node_state where automation_id=$automationId and node_id=$nodeId and partition=$partition`,
      { automationId, nodeId, partition },
    );
  }

  forAutomation(automationId: string): NodeStateRow[] {
    return this.context.sql.all(
      STORED_STATE,
      `select ${COLUMNS} from automation_node_state where automation_id=$automationId order by node_id, partition`,
      { automationId },
    );
  }

  dueWakes(through: string): NodeStateRow[] {
    return this.context.sql.all(
      STORED_STATE,
      `select ${COLUMNS} from automation_node_state where wake_at is not null and wake_at <= $through order by wake_at, automation_id, node_id, partition`,
      { through: moment(through) },
    );
  }

  dueSlots(slots: SlotKind, through: string): NodeStateRow[] {
    return this.context.sql.all(
      STORED_STATE,
      `select ${COLUMNS} from automation_node_state where partition=$partition and substr(node_id,1,length($prefix))=$prefix and wake_at is not null and wake_at <= $through order by wake_at, automation_id, node_id`,
      { partition: slots.partition, prefix: slots.prefix, through: moment(through) },
    );
  }

  nextSlotWake(slots: SlotKind): string | null {
    const next = this.context.sql.get(
      NEXT_WAKE,
      `select min(wake_at) as wake_at from automation_node_state where partition=$partition and substr(node_id,1,length($prefix))=$prefix and wake_at is not null`,
      { partition: slots.partition, prefix: slots.prefix },
    );
    return next?.wake_at ?? null;
  }

  save(write: NodeStateWrite): NodeStateRow {
    return this.context.write(() => {
      const partition = write.partition ?? '';
      this.context.sql.run(
        'save automation node state',
        `insert into automation_node_state(automation_id,node_id,partition,state,wake_at,updated_at)
         values($automationId,$nodeId,$partition,$state,$wakeAt,$now)
         on conflict(automation_id,node_id,partition) do update set
           state=excluded.state, wake_at=excluded.wake_at, updated_at=excluded.updated_at`,
        {
          automationId: write.automationId,
          nodeId: write.nodeId,
          partition,
          state: jsonText(JSON_VALUE.parse(write.state)),
          wakeAt: write.wakeAt === undefined || write.wakeAt === null ? null : moment(write.wakeAt),
          now: this.context.now(),
        },
      );
      const saved = this.get(write.automationId, write.nodeId, partition);
      if (saved === undefined) throw new Error('The saved node state could not be read back.');
      return saved;
    });
  }

  clearWake(automationId: string, nodeId: string, partition = ''): void {
    this.context.sql.run(
      'clear an automation node wake time',
      'update automation_node_state set wake_at=null where automation_id=$automationId and node_id=$nodeId and partition=$partition',
      { automationId, nodeId, partition },
    );
  }

  remove(automationId: string, nodeId: string, partition?: string): number {
    return this.context.sql.run(
      'forget automation node state',
      'delete from automation_node_state where automation_id=$automationId and node_id=$nodeId and ($partition is null or partition=$partition)',
      { automationId, nodeId, partition: partition ?? null },
    );
  }

  keepOnly(automationId: string, nodeIds: readonly string[]): number {
    return this.context.sql.run(
      'forget state of nodes that no longer exist',
      'delete from automation_node_state where automation_id=$automationId and node_id not in (select value from json_each($nodeIds))',
      { automationId, nodeIds: jsonText(nodeIds) },
    );
  }

  forget(automationId: string): number {
    return this.context.sql.run(
      'forget the node state of an automation',
      'delete from automation_node_state where automation_id=$automationId',
      { automationId },
    );
  }
}
