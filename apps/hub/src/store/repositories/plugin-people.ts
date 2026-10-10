import { PLUGIN_PERSON, type PluginPerson, type PluginPersonChange } from '@smarteverything/domain';
import type { StoreContext } from '../context';

const COLUMNS = 'plugin_id, external_id, name, status, created_at as added_at';

export class PluginPeopleRepository {
  constructor(private readonly context: StoreContext) {}

  list(pluginId: string): PluginPerson[] {
    return this.context.sql.all(
      PLUGIN_PERSON,
      `select ${COLUMNS} from plugin_people where plugin_id = $pluginId order by status desc, name collate nocase, external_id`,
      { pluginId },
    );
  }

  find(pluginId: string, externalId: string): PluginPerson | undefined {
    return this.context.sql.get(
      PLUGIN_PERSON,
      `select ${COLUMNS} from plugin_people where plugin_id = $pluginId and external_id = $externalId`,
      { pluginId, externalId },
    );
  }

  save(pluginId: string, externalId: string, change: PluginPersonChange): PluginPerson {
    return this.context.write(() => {
      const now = this.context.now();
      this.context.sql.run(
        'save the plugin person',
        `insert into plugin_people (plugin_id, external_id, name, status, created_at, updated_at)
         values ($pluginId, $externalId, $name, $status, $now, $now)
         on conflict (plugin_id, external_id) do update set name = excluded.name,
           status = excluded.status, updated_at = excluded.updated_at`,
        { pluginId, externalId, name: change.name, status: change.status, now },
      );
      const saved = this.find(pluginId, externalId);
      if (saved === undefined) {
        throw new Error(`The plugin person ${externalId} was saved but cannot be read back.`);
      }
      return saved;
    });
  }

  remove(pluginId: string, externalId: string): boolean {
    return (
      this.context.write(() =>
        this.context.sql.run(
          'remove the plugin person',
          'delete from plugin_people where plugin_id = $pluginId and external_id = $externalId',
          { pluginId, externalId },
        ),
      ) > 0
    );
  }
}
