import { z } from 'zod';
import { AI_PROJECT_PREVIEW_SOURCE } from '@smarteverything/domain';
import type { StoreContext } from '../context';
const ROW = z.strictObject({
  id: z.uuid(),
  chat_id: z.uuid(),
  profile_id: z.uuid(),
  title: z.string(),
  revision: z.uuid(),
  root: AI_PROJECT_PREVIEW_SOURCE.shape.root,
  entry: AI_PROJECT_PREVIEW_SOURCE.shape.entry,
  standalone: z.union([z.literal(0), z.literal(1)]),
  checksum: z.string().nullable(),
});
export type PreviewProjectRow = z.output<typeof ROW>;
export class PreviewProjectsRepository {
  constructor(private readonly context: StoreContext) {}
  list(): readonly PreviewProjectRow[] {
    return this.context.sql.all(ROW, 'select * from ai_preview_projects');
  }
  put(input: PreviewProjectRow): void {
    const row = ROW.parse(input);
    this.context.write(() =>
      this.context.sql.run(
        'save central preview reference',
        `insert into ai_preview_projects(id,chat_id,profile_id,title,revision,root,entry,standalone,checksum)
       values($id,$chat_id,$profile_id,$title,$revision,$root,$entry,$standalone,$checksum)
       on conflict(id) do update set title=excluded.title,revision=excluded.revision,
       root=excluded.root,entry=excluded.entry,standalone=excluded.standalone,checksum=excluded.checksum`,
        row,
      ),
    );
  }
  remove(id: string): void {
    this.context.write(() =>
      this.context.sql.run(
        'withdraw central preview reference',
        'delete from ai_preview_projects where id=$id',
        { id },
      ),
    );
  }
}
