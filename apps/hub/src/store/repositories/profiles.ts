import {
  PROFILE_ROW,
  UNSET_FITNESS_GOALS,
  type FitnessSettingsChange,
  type NewProfile,
  type ProfileChange,
  type ProfileRow,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { StoreConflictError, jsonText } from '../sql';

const STORED_PROFILE = storedRow(PROFILE_ROW, { json: ['fitness_goals'] });

const COLUMNS =
  'id, name, colour, sex, birth_date, height_cm, scale_user, fitness_goals, max_heart_rate, position, created_at, updated_at';

const POSITION = z.object({ next: z.number() });

export class ProfilesRepository {
  constructor(private readonly context: StoreContext) {}

  list(): ProfileRow[] {
    return this.context.sql.all(
      STORED_PROFILE,
      `select ${COLUMNS} from profiles order by position, created_at`,
    );
  }

  byId(id: string): ProfileRow {
    return found(
      this.context.sql.get(STORED_PROFILE, `select ${COLUMNS} from profiles where id = $id`, {
        id,
      }),
      'profile',
      id,
    );
  }

  first(): ProfileRow {
    return found(this.list()[0], 'profile', 'first');
  }

  activeOf(clientId: string): ProfileRow {
    const row = this.context.sql.get(
      STORED_PROFILE,
      `select ${COLUMNS.split(', ')
        .map((column) => `p.${column}`)
        .join(', ')} from clients c join profiles p on p.id = c.profile_id where c.id = $clientId`,
      { clientId },
    );
    return found(row, 'active profile of the client', clientId);
  }

  create(profile: NewProfile): ProfileRow {
    return this.context.write(() => {
      const id = this.context.newId();
      const now = this.context.now();
      const next = this.context.sql.get(
        POSITION,
        'select coalesce(max(position) + 1, 0) as next from profiles',
      );
      this.context.sql.run(
        'add the profile',
        `insert into profiles (id, name, colour, sex, birth_date, height_cm, scale_user, fitness_goals,
           position, created_at, updated_at)
         values ($id, $name, $colour, $sex, $birthDate, $heightCm, $scaleUser, $goals, $position, $now, $now)`,
        {
          id,
          name: profile.name,
          colour: profile.colour ?? 'aqua',
          sex: profile.sex ?? null,
          birthDate: profile.birth_date ?? null,
          heightCm: profile.height_cm ?? null,
          scaleUser: profile.scale_user ?? null,
          goals: jsonText(UNSET_FITNESS_GOALS),
          position: next?.next ?? 0,
          now,
        },
      );
      const row = this.byId(id);
      this.context.changed('profiles', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, change: ProfileChange): ProfileRow {
    return this.change(id, { ...change });
  }

  updateFitness(id: string, change: FitnessSettingsChange): ProfileRow {
    return this.context.write(() =>
      this.change(id, {
        ...(change.goals === undefined
          ? {}
          : { fitness_goals: jsonText({ ...this.byId(id).fitness_goals, ...change.goals }) }),
        ...(change.maxHeartRate === undefined ? {} : { max_heart_rate: change.maxHeartRate }),
      }),
    );
  }

  learnScaleUser(id: string, scaleUser: number): void {
    this.context.write(() => {
      const holders = this.list().filter(
        (profile) => profile.scale_user === scaleUser && profile.id !== id,
      );
      for (const holder of holders) {
        this.change(holder.id, { scale_user: null });
      }
      if (holders.length === 0 && this.byId(id).scale_user !== scaleUser) {
        this.change(id, { scale_user: scaleUser });
      }
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      const rest = this.list().filter((profile) => profile.id !== id);
      const [heir] = rest;
      if (heir === undefined) {
        throw new StoreConflictError('remove the profile', 'the home needs at least one profile');
      }
      this.context.sql.run(
        'move the apps to another profile',
        'update clients set profile_id = $heir where profile_id = $id',
        { heir: heir.id, id },
      );
      this.context.sql.run('remove the profile', 'delete from profiles where id = $id', { id });
      this.context.changed('profiles', 'DELETE', null, before);
    });
  }

  private change(
    id: string,
    values: Readonly<Record<string, SQLInputValue | undefined>>,
  ): ProfileRow {
    return this.context.write(() => {
      const before = this.byId(id);
      const set = assignments({ ...values, updated_at: this.context.now() });
      this.context.sql.run('change the profile', `update profiles set ${set.text} where id = $id`, {
        ...set.parameters,
        id,
      });
      const after = this.byId(id);
      this.context.changed('profiles', 'UPDATE', after, before);
      return after;
    });
  }
}
