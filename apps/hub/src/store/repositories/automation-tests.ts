import { STORED_TEST, type StoredTest } from '@smarteverything/domain';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED = storedRow(STORED_TEST, { json: ['scenario', 'expectations'] });
const COLUMNS = Object.keys(STORED_TEST.shape).join(',');

export interface TestWrite {
  readonly automationId: string;
  readonly id?: string;
  readonly name: string;
  readonly scenario: StoredTest['scenario'];
  readonly expectations?: StoredTest['expectations'];
}

export class AutomationTestsRepository {
  constructor(private readonly context: StoreContext) {}

  list(automationId: string): StoredTest[] {
    return this.context.sql.all(
      STORED,
      `select ${COLUMNS} from automation_tests where automation_id=$automationId order by name, id`,
      { automationId },
    );
  }

  byId(automationId: string, id: string): StoredTest {
    return found(
      this.context.sql.get(
        STORED,
        `select ${COLUMNS} from automation_tests where automation_id=$automationId and id=$id`,
        { automationId, id },
      ),
      'automation test',
      id,
    );
  }

  save(write: TestWrite): StoredTest {
    return this.context.write(() => {
      const id = write.id ?? this.context.newId();
      const checked = STORED_TEST.parse({
        automation_id: write.automationId,
        id,
        name: write.name,
        scenario: write.scenario,
        expectations: write.expectations ?? [],
        updated_at: this.context.now(),
      });
      this.context.sql.run(
        'save automation test',
        `insert into automation_tests(automation_id,id,name,scenario,expectations,updated_at)
         values($automationId,$id,$name,$scenario,$expectations,$now)
         on conflict(automation_id,id) do update set
           name=excluded.name, scenario=excluded.scenario, expectations=excluded.expectations, updated_at=excluded.updated_at`,
        {
          automationId: checked.automation_id,
          id: checked.id,
          name: checked.name,
          scenario: jsonText(checked.scenario),
          expectations: jsonText(checked.expectations),
          now: checked.updated_at,
        },
      );
      return this.byId(write.automationId, id);
    });
  }

  remove(automationId: string, id: string): void {
    this.byId(automationId, id);
    this.context.sql.run(
      'remove automation test',
      'delete from automation_tests where automation_id=$automationId and id=$id',
      { automationId, id },
    );
  }
}
