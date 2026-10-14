import { z } from 'zod';
import {
  HARNESS_SKILL_ASSET,
  HARNESS_SKILL_PRESENTATION,
  type HarnessSkillAsset,
  type HarnessSkillPresentation,
} from '@smarteverything/domain';
import type { StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';

const MAX_CACHED_PRESENTATIONS = 1024;
const PRESENTATION_ROW = z.strictObject({
  presentation: SQL_JSON.pipe(HARNESS_SKILL_PRESENTATION),
});
const COUNT_ROW = z.strictObject({ count: z.int().nonnegative() });

export class HarnessSkillPresentationStorageError extends Error {
  override readonly name = 'HarnessSkillPresentationStorageError';
  constructor(readonly reason: string) {
    super(reason);
  }
}

export class HarnessSkillPresentationsRepository {
  constructor(private readonly context: StoreContext) {}

  read(asset: HarnessSkillAsset): HarnessSkillPresentation | undefined {
    return this.context.sql.get(
      PRESENTATION_ROW,
      'select presentation from harness_skill_presentations where asset_identity=$identity',
      { identity: jsonText(HARNESS_SKILL_ASSET.parse(asset)) },
    )?.presentation;
  }

  keep(asset: HarnessSkillAsset, input: unknown): HarnessSkillPresentation {
    const presentation = HARNESS_SKILL_PRESENTATION.parse(input);
    return this.context.write(() => {
      const existing = this.read(asset);
      if (existing !== undefined) {
        if (jsonText(existing) !== jsonText(presentation))
          throw new HarnessSkillPresentationStorageError(
            'Immutable skill presentation differs from the inspected asset identity.',
          );
        return existing;
      }
      const count = this.context.sql.get(
        COUNT_ROW,
        'select count(*) as count from harness_skill_presentations',
      );
      if (count === undefined || count.count >= MAX_CACHED_PRESENTATIONS)
        throw new HarnessSkillPresentationStorageError(
          'The bounded skill presentation cache is full.',
        );
      this.context.sql.run(
        'retain immutable inspected skill presentation',
        'insert into harness_skill_presentations(asset_identity,presentation,created_at) values($identity,$presentation,$now)',
        {
          identity: jsonText(HARNESS_SKILL_ASSET.parse(asset)),
          presentation: jsonText(presentation),
          now: this.context.now(),
        },
      );
      return presentation;
    });
  }
}
