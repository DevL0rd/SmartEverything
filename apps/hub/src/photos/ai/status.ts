import type {
  PhotoAiPeople,
  PhotoAiStageProgress,
  PhotoAiStatus,
  PhotoFaceDevice,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Ledger } from '../../ledger/ledger';
import { found, type StoreContext } from '../../store/context';
import type { PhotoConsent } from './consent';
import { ESTIMATE_MICROS_PER_PHOTO } from './defaults';
import { ITEMS_OF, librarySubjectScope, subjectOf, type SubjectScope } from './scope';
import type { PhotoAiModelStore } from './settings';

const COUNTS = z.strictObject({
  done: z.int(),
  queued: z.int(),
  failed: z.int(),
  needs_key: z.int(),
});

const TOTAL = z.strictObject({ total: z.int() });

const SUBJECT = z.strictObject({ owner: z.string() });

const FACES = z.strictObject({ faces: z.int(), grouped: z.int() });

const EPOCH = '1970-01-01T00:00:00.000Z';

export interface StatusEnvironment {
  readonly context: StoreContext;
  readonly ledger: Pick<Ledger, 'totals'>;
  readonly consent: PhotoConsent;
  readonly models: PhotoAiModelStore;
  readonly ownerIds: () => readonly string[];
  readonly homeOwner: () => string;
  readonly hasKey: () => boolean;
  readonly faceDevice: () => PhotoFaceDevice;
  readonly now: () => Date;
}

interface Subject {
  readonly profileId: string;
  readonly scope: SubjectScope;
}

const EMPTY_STAGE: PhotoAiStageProgress = { done: 0, queued: 0, failed: 0, needsKey: 0 };

function plus(a: PhotoAiStageProgress, b: PhotoAiStageProgress): PhotoAiStageProgress {
  return {
    done: a.done + b.done,
    queued: a.queued + b.queued,
    failed: a.failed + b.failed,
    needsKey: a.needsKey + b.needsKey,
  };
}

const FROM = `from ${ITEMS_OF} join`;

const STAGES = {
  faces: `select
      count(case when j.state = 'done' then 1 end) as done,
      count(case when j.state in ('queued', 'running') then 1 end) as queued,
      count(case when j.state = 'failed' then 1 end) as failed, 0 as needs_key
    ${FROM} drive_media_jobs j on j.item_id = i.id and j.rev = i.rev and j.kind = 'faces'`,
  tags: `select
      count(case when a.state = 'done' then 1 end) as done,
      (select count(*) ${FROM} drive_media_jobs j on j.item_id = i.id and j.rev = i.rev
        and j.kind = 'vision' and j.state in ('queued', 'running')
        where ${librarySubjectScope()} and SCOPE) as queued,
      count(case when a.state = 'failed' then 1 end) as failed,
      count(case when a.state = 'needs_key' then 1 end) as needs_key
    ${FROM} photo_analysis a on a.item_id = i.id and a.rev = i.rev`,
  index: `select
      count(case when e.item_id is not null then 1 end) as done,
      count(case when j.state in ('queued', 'running') then 1 end) as queued,
      count(case when j.state = 'failed' then 1 end) as failed, 0 as needs_key
    from ${ITEMS_OF}
      left join photo_embeddings e on e.item_id = i.id and e.rev = i.rev
      left join drive_media_jobs j on j.item_id = i.id and j.rev = i.rev and j.kind = 'embed'`,
} as const;

export class PhotoAiStatusReader {
  constructor(private readonly env: StatusEnvironment) {}

  read(profileId: string): PhotoAiStatus {
    const switches = this.env.consent.switches(profileId);
    const owner = this.env.ownerIds().includes(profileId);
    const subjects = this.subjects(profileId, owner);
    const totals = this.sum(subjects);
    const unit = this.unitMicros();
    return {
      smartSearch: switches.smartSearch,
      faceGrouping: switches.faceGrouping,
      hasKey: this.env.hasKey(),
      total: totals.total,
      faces: totals.faces,
      tags: totals.tags,
      index: totals.index,
      people: this.people(profileId, subjects),
      spentMicros: this.spent(profileId, owner),
      estimateMicros: this.remaining(subjects) * unit,
      models: this.env.models.read(),
      faceDevice: this.env.faceDevice(),
    };
  }

  remaining(subjects: readonly Subject[]): number {
    let remaining = 0;
    for (const subject of subjects) {
      if (!this.env.consent.smartSearch(subject.profileId)) continue;
      remaining += this.stale(subject.scope);
    }
    return remaining;
  }

  stale(scope: SubjectScope): number {
    const { vision } = this.env.models.read();
    return (
      this.env.context.sql.get(
        TOTAL,
        `select count(*) as total from ${ITEMS_OF}
          where ${librarySubjectScope()} and ${scope.text}
            and not exists (select 1 from photo_analysis a
              where a.item_id = i.id and a.rev = i.rev and a.state = 'done' and a.model = $model)`,
        { ...scope.parameters, model: vision },
      )?.total ?? 0
    );
  }

  subjects(profileId: string, owner: boolean): Subject[] {
    const home = this.env.homeOwner();
    const profiles = owner ? this.subjectProfiles(home) : [profileId];
    return profiles.map((subject) => ({
      profileId: subject,
      scope: subjectOf(subject, subject === home),
    }));
  }

  unitMicros(): number {
    const analysed = this.env.context.sql.get(
      TOTAL,
      "select count(*) as total from photo_analysis where state = 'done'",
    );
    const done = analysed?.total ?? 0;
    if (done === 0) return ESTIMATE_MICROS_PER_PHOTO;
    const spent = this.env.ledger.totals({
      from: EPOCH,
      to: this.through(),
      works: ['photos'],
    }).sum.cost_micros;
    return spent === 0 ? ESTIMATE_MICROS_PER_PHOTO : Math.ceil(spent / done);
  }

  private through(): string {
    return new Date(this.env.now().getTime() + 1).toISOString();
  }

  private subjectProfiles(home: string): string[] {
    const owners = this.env.context.sql
      .all(
        SUBJECT,
        `select distinct owner_profile_id as owner from drive_roots
          where owner_profile_id is not null order by owner_profile_id`,
      )
      .map((row) => row.owner);
    return [...new Set([home, ...owners])];
  }

  private sum(subjects: readonly Subject[]): {
    total: number;
    faces: PhotoAiStageProgress;
    tags: PhotoAiStageProgress;
    index: PhotoAiStageProgress;
  } {
    let total = 0;
    let faces = EMPTY_STAGE;
    let tags = EMPTY_STAGE;
    let index = EMPTY_STAGE;
    for (const subject of subjects) {
      total += this.count(subject.scope);
      faces = plus(faces, this.stage('faces', subject.scope));
      tags = plus(tags, this.stage('tags', subject.scope));
      index = plus(index, this.stage('index', subject.scope));
    }
    return { total, faces, tags, index };
  }

  private people(viewer: string, subjects: readonly Subject[]): PhotoAiPeople {
    let faces = 0;
    let grouped = 0;
    for (const { scope } of subjects) {
      const row = found(
        this.env.context.sql.get(
          FACES,
          `select count(*) as faces,
            count(case when exists (select 1 from photo_group_faces gf
              where gf.face_id = f.id and gf.profile_id = $viewer and gf.source <> 'rejected')
              then 1 end) as grouped
          from ${ITEMS_OF} join photo_faces f on f.item_id = i.id and f.rev = i.rev
          where f.kind = 'person' and ${librarySubjectScope()} and ${scope.text}`,
          { ...scope.parameters, viewer },
        ),
        'photo face counts',
        viewer,
      );
      faces += row.faces;
      grouped += row.grouped;
    }
    return { faces, grouped };
  }

  private count(scope: SubjectScope): number {
    return (
      this.env.context.sql.get(
        TOTAL,
        `select count(*) as total from ${ITEMS_OF} where ${librarySubjectScope()} and ${scope.text}`,
        scope.parameters,
      )?.total ?? 0
    );
  }

  private stage(name: keyof typeof STAGES, scope: SubjectScope): PhotoAiStageProgress {
    const text = STAGES[name].replaceAll('SCOPE', scope.text);
    const row = this.env.context.sql.get(
      COUNTS,
      `${text} where ${librarySubjectScope()} and ${scope.text}`,
      scope.parameters,
    );
    return row === undefined
      ? EMPTY_STAGE
      : { done: row.done, queued: row.queued, failed: row.failed, needsKey: row.needs_key };
  }

  private spent(profileId: string, owner: boolean): number {
    return this.env.ledger.totals({
      from: EPOCH,
      to: this.through(),
      works: ['photos'],
      ...(owner ? {} : { profileIds: [profileId] }),
    }).sum.cost_micros;
  }
}
