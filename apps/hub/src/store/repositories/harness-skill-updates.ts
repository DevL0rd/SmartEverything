import { z } from 'zod';
import { HARNESS_SKILL_UPDATES_WRITE, type HarnessSkillUpdates } from '@smarteverything/domain';
import type { StoreContext } from '../context';

const ROW = z.strictObject({ automatic: z.union([z.literal(0), z.literal(1)]) });
export class HarnessSkillUpdatesRepository {
  constructor(private readonly context: StoreContext) {}

  read(): HarnessSkillUpdates {
    const row = this.context.sql.get(
      ROW,
      'select automatic from harness_skill_updates where singleton=1',
    );
    return { automatic: row === undefined || row.automatic === 1 };
  }

  replace(input: unknown): HarnessSkillUpdates {
    const settings = HARNESS_SKILL_UPDATES_WRITE.parse(input);
    return this.context.write(() => {
      this.context.sql.run(
        'save shared automatic skill updates',
        'insert into harness_skill_updates(singleton,automatic) values(1,$automatic) on conflict(singleton) do update set automatic=excluded.automatic',
        { automatic: settings.automatic ? 1 : 0 },
      );
      return settings;
    });
  }
}
