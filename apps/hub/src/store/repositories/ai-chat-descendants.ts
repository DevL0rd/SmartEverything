import { z } from 'zod';
import type { StoreContext } from '../context';

export function subagentChatIds(context: StoreContext, root: string): string[] {
  return context.sql
    .all(
      z.strictObject({ id: z.uuid() }),
      `with recursive scope(id,depth,path) as (
      select $id,0,',' || $id || ','
      union all
      select c.id,s.depth+1,s.path || c.id || ',' from ai_chats c
      join scope s on c.parent_id=s.id
      where c.kind='subagent' and instr(s.path,',' || c.id || ',')=0
    ) select id from scope order by depth desc,id`,
      { id: root },
    )
    .map((row) => row.id);
}
