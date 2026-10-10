import { SCENE_ROW, type CommandAction, type SceneRow } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_SCENE = storedRow(SCENE_ROW, { json: ['actions'] });

const COLUMNS = 'id, name, icon, actions, position, created_at';

export interface NewScene {
  readonly name: string;
  readonly icon: string;
  readonly actions: readonly CommandAction[];
  readonly position: number;
}

export type SceneChange = { readonly [K in 'name' | 'icon' | 'actions']?: NewScene[K] | undefined };

export class ScenesRepository {
  constructor(private readonly context: StoreContext) {}

  list(): SceneRow[] {
    return this.context.sql.all(
      STORED_SCENE,
      `select ${COLUMNS} from scenes order by position, name`,
    );
  }

  byId(id: string): SceneRow {
    return found(
      this.context.sql.get(STORED_SCENE, `select ${COLUMNS} from scenes where id = $id`, { id }),
      'scene',
      id,
    );
  }

  create(scene: NewScene): SceneRow {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'add the scene',
        `insert into scenes (id, name, icon, actions, position, created_at)
         values ($id, $name, $icon, $actions, $position, $now)`,
        {
          id,
          name: scene.name,
          icon: scene.icon,
          actions: jsonText(scene.actions),
          position: scene.position,
          now: this.context.now(),
        },
      );
      const row = this.byId(id);
      this.context.changed('scenes', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, change: SceneChange): SceneRow {
    return this.change(id, {
      ...(change.name === undefined ? {} : { name: change.name }),
      ...(change.icon === undefined ? {} : { icon: change.icon }),
      ...(change.actions === undefined ? {} : { actions: jsonText(change.actions) }),
    });
  }

  order(ids: readonly string[]): SceneRow[] {
    return this.context.write(() => {
      ids.forEach((id, position) => {
        this.change(id, { position });
      });
      return this.list();
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run('remove the scene', 'delete from scenes where id = $id', { id });
      this.context.changed('scenes', 'DELETE', null, before);
    });
  }

  private change(id: string, values: Readonly<Record<string, SQLInputValue>>): SceneRow {
    return this.context.write(() => {
      const before = this.byId(id);
      const set = assignments(values);
      this.context.sql.run('change the scene', `update scenes set ${set.text} where id = $id`, {
        ...set.parameters,
        id,
      });
      const after = this.byId(id);
      this.context.changed('scenes', 'UPDATE', after, before);
      return after;
    });
  }
}
