import {
  ACCESS_SCOPES,
  PERSON_ACCESS,
  PERSON_BUDGET,
  TEMPLATE_SCOPES,
  NO_CONDITIONS,
  type AccessScopes,
  type PersonAccess,
  type PersonBudget,
  type PersonAccessChange,
  PERSON_ROLES,
  type PersonRole,
  type PersonTemplate,
  QUIET_HOURS,
  type QuietHours,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { StoreConflictError, jsonText } from '../sql';

const STORED_ACCESS = storedRow(PERSON_ACCESS, { json: ['scopes', 'budget', 'conditions'] });

const COLUMNS = 'profile_id, role, template, scopes, budget, conditions, expires_at, updated_at';

const STANDING_ROW = z.object({
  role: z.string(),
  expires_at: z.string().nullable(),
  home_only: z.number(),
  schedule: z.string().nullable(),
});

const OWNER_ID = z.object({ id: z.string() });

const STORED_SCOPES = z.object({ scopes: z.string() });

const STORED_SCHEDULE = z.object({ id: z.string(), schedule: z.string() });

const STORED_BUDGET = z.object({ budget: z.string().nullable() });

export type KnownStanding = Extract<PersonStanding, { readonly known: true }>;

export type PersonStanding =
  | {
      readonly known: true;
      readonly role: PersonRole;
      readonly expires_at: string | null;
      readonly home_only: boolean;
      readonly schedule: QuietHours | null;
    }
  | { readonly known: false; readonly reason: 'missing' | 'unreadable' };

function scheduleOf(text: string | null): QuietHours | null | undefined {
  if (text === null) return null;
  const parsed = QUIET_HOURS.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : undefined;
}

function standingOf(row: z.output<typeof STANDING_ROW> | undefined): PersonStanding {
  if (row === undefined) return { known: false, reason: 'missing' };
  const role = PERSON_ROLES.find((candidate) => candidate === row.role);
  const endsBadly = row.expires_at !== null && Number.isNaN(Date.parse(row.expires_at));
  const schedule = scheduleOf(row.schedule);
  if (role === undefined || endsBadly || schedule === undefined) {
    return { known: false, reason: 'unreadable' };
  }
  return {
    known: true,
    role,
    expires_at: row.expires_at,
    home_only: row.home_only === 1,
    schedule,
  };
}

function optionalJson(value: unknown): string | undefined {
  return value === undefined ? undefined : jsonText(value);
}

export function insertPersonAccess(
  context: StoreContext,
  profileId: string,
  role: PersonRole,
  template: PersonTemplate,
): void {
  context.sql.run(
    'give the person their access',
    `insert into person_access (profile_id, role, template, scopes, conditions, updated_at)
     values ($profileId, $role, $template, $scopes, $conditions, $now)`,
    {
      profileId,
      role,
      template,
      scopes: jsonText(TEMPLATE_SCOPES[template]),
      conditions: jsonText(NO_CONDITIONS),
      now: context.now(),
    },
  );
}

export class PersonAccessRepository {
  constructor(private readonly context: StoreContext) {}

  list(): PersonAccess[] {
    return this.context.sql.all(
      STORED_ACCESS,
      `select ${COLUMNS} from person_access order by profile_id`,
    );
  }

  find(profileId: string): PersonAccess | undefined {
    return this.context.sql.get(
      STORED_ACCESS,
      `select ${COLUMNS} from person_access where profile_id = $profileId`,
      { profileId },
    );
  }

  byProfile(profileId: string): PersonAccess {
    return found(this.find(profileId), 'person access', profileId);
  }

  standing(profileId: string): PersonStanding {
    return standingOf(
      this.context.sql.get(
        STANDING_ROW,
        `select role, expires_at,
           coalesce(json_extract(conditions, '$.home_only') = 1, 0) as home_only,
           json_extract(conditions, '$.schedule') as schedule
         from person_access where profile_id = $profileId`,
        { profileId },
      ),
    );
  }

  scopes(profileId: string): AccessScopes | undefined {
    const row = this.context.sql.get(
      STORED_SCOPES,
      'select scopes from person_access where profile_id = $profileId',
      { profileId },
    );
    if (row === undefined) return undefined;
    const parsed = ACCESS_SCOPES.safeParse(JSON.parse(row.scopes));
    return parsed.success ? parsed.data : undefined;
  }

  budget(profileId: string): PersonBudget | null | undefined {
    const row = this.context.sql.get(
      STORED_BUDGET,
      'select budget from person_access where profile_id = $profileId',
      { profileId },
    );
    if (row === undefined) return undefined;
    if (row.budget === null) return null;
    const parsed = PERSON_BUDGET.safeParse(JSON.parse(row.budget));
    return parsed.success ? parsed.data : undefined;
  }

  schedules(): { readonly profileId: string; readonly schedule: QuietHours }[] {
    return this.context.sql
      .all(
        STORED_SCHEDULE,
        `select profile_id as id, json_extract(conditions, '$.schedule') as schedule
         from person_access
         where role != 'owner' and json_extract(conditions, '$.schedule') is not null`,
      )
      .flatMap((row) => {
        const schedule = QUIET_HOURS.safeParse(JSON.parse(row.schedule));
        return schedule.success ? [{ profileId: row.id, schedule: schedule.data }] : [];
      });
  }

  budgetedIds(): string[] {
    return this.context.sql
      .all(OWNER_ID, 'select profile_id as id from person_access where budget is not null')
      .map((row) => row.id);
  }

  ownerIds(): string[] {
    return this.context.sql
      .all(OWNER_ID, "select profile_id as id from person_access where role = 'owner'")
      .map((row) => row.id);
  }

  homeOwner(): string {
    const owner = found(
      this.context.sql.get(
        OWNER_ID,
        `select p.id from profiles p join person_access a on a.profile_id = p.id
         where a.role = 'owner'
         order by (select count(*) from clients c where c.profile_id = p.id and c.built_in = 1) desc,
           p.position, p.created_at, p.id
         limit 1`,
      ),
      'owner person',
      'home',
    );
    return owner.id;
  }

  expiredIds(now: string): string[] {
    return this.context.sql
      .all(
        OWNER_ID,
        `select profile_id as id from person_access
         where expires_at is not null and expires_at <= $now
         order by expires_at, profile_id`,
        { now },
      )
      .map((row) => row.id);
  }

  nextExpiry(after: string): string | undefined {
    return this.context.sql.get(
      z.object({ expires_at: z.string() }),
      `select expires_at from person_access where expires_at > $after
       order by expires_at limit 1`,
      { after },
    )?.expires_at;
  }

  change(profileId: string, change: PersonAccessChange): PersonAccess {
    return this.context.write(() => {
      const before = this.byProfile(profileId);
      const role = change.role ?? before.role;
      const expiresAt = change.expires_at === undefined ? before.expires_at : change.expires_at;
      const budget = change.budget === undefined ? before.budget : change.budget;
      this.assertAllowed(profileId, { role, expiresAt, budget });
      const set = assignments({
        role: change.role,
        template: change.template,
        scopes: optionalJson(change.scopes),
        budget: change.budget === null ? null : optionalJson(change.budget),
        conditions: optionalJson(change.conditions),
        expires_at: change.expires_at,
        updated_at: this.context.now(),
      });
      this.context.sql.run(
        'change the person access',
        `update person_access set ${set.text} where profile_id = $profileId`,
        { ...set.parameters, profileId },
      );
      return this.byProfile(profileId);
    });
  }

  assertNotLastOwner(profileId: string): void {
    const owners = this.ownerIds();
    if (owners.length === 1 && owners[0] === profileId) {
      throw new StoreConflictError('remove the owner', 'the home needs at least one owner person');
    }
  }

  private assertAllowed(
    profileId: string,
    next: {
      readonly role: PersonRole;
      readonly expiresAt: string | null;
      readonly budget: PersonBudget | null;
    },
  ): void {
    if (next.role !== 'owner') {
      this.assertNotLastOwner(profileId);
      this.assertNotHomeOwner(profileId);
    } else if (next.expiresAt !== null) {
      throw new StoreConflictError('change the person access', 'an owner cannot have an end time');
    } else if (next.budget !== null) {
      throw new StoreConflictError('change the person access', 'an owner has no AI budget limit');
    }
  }

  private assertNotHomeOwner(profileId: string): void {
    if (this.homeOwner() === profileId) {
      throw new StoreConflictError(
        'change the person access',
        'the home owner person stays an owner',
      );
    }
  }
}
