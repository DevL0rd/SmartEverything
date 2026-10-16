import {
  AUTOMATION_SEQUENCE_DEFINITION,
  AUTOMATION_SEQUENCE_ROW,
  ApiError,
  identifyActions,
  walkActions,
  automationReferences,
  JSON_VALUE,
  type AutomationSequenceDefinition,
  type AutomationSequenceRow,
} from '@smarteverything/domain';
import { currentExecutionAuthorities } from '../../assistant/execution-authority';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { jsonText } from '../sql';
import { HarnessEffectsRepository } from './harness-effects';
import { automationDefinitionRevision } from './automation-revisions';
import { AutomationsRepository } from './automations';

const STORED_SEQUENCE = storedRow(AUTOMATION_SEQUENCE_ROW, { json: ['definition'] });
export class AutomationSequencesRepository {
  constructor(private readonly context: StoreContext) {}
  list(): AutomationSequenceRow[] {
    return this.context.sql.all(
      STORED_SEQUENCE,
      'select * from automation_sequences order by name,id',
    );
  }
  byId(id: string): AutomationSequenceRow {
    return found(
      this.context.sql.get(STORED_SEQUENCE, 'select * from automation_sequences where id=$id', {
        id,
      }),
      'sequence',
      id,
    );
  }
  create(name: string, definition: AutomationSequenceDefinition): AutomationSequenceRow {
    return this.context.write(() => {
      const id = this.context.newId();
      const next = this.identified(definition, true);
      this.context.sql.run(
        'create sequence',
        'insert into automation_sequences(id,name,definition,revision,created_at,updated_at) values($id,$name,$definition,$revision,$now,$now)',
        {
          id,
          name,
          definition: jsonText(next),
          revision: automationDefinitionRevision(next),
          now: this.context.now(),
        },
      );
      new HarnessEffectsRepository(this.context).keep(
        'sequence',
        id,
        currentExecutionAuthorities(),
      );
      const row = this.byId(id);
      this.context.changed('automation_sequences', 'INSERT', row, null);
      return row;
    });
  }
  update(
    id: string,
    change: {
      readonly name: string;
      readonly definition: AutomationSequenceDefinition;
      readonly expectedRevision: string;
    },
    reauthorizeProfile?: string,
  ): AutomationSequenceRow {
    const { name, definition, expectedRevision } = change;
    return this.context.write(() => {
      const before = this.byId(id);
      if (before.revision !== expectedRevision)
        throw new ApiError(
          'conflict',
          'SequenceRevisionConflictError: Reload the sequence before saving.',
        );
      const authorities = currentExecutionAuthorities();
      const effects = new HarnessEffectsRepository(this.context);
      if (reauthorizeProfile !== undefined) {
        if (authorities.length > 0)
          throw new ApiError('forbidden', 'AI changes cannot replace sequence authorization.');
        effects.reauthorize('sequence', id, reauthorizeProfile);
      }
      effects.keep('sequence', id, authorities);
      const next = this.identified(definition, false);
      this.context.sql.run(
        'change sequence',
        'update automation_sequences set name=$name,definition=$definition,revision=$revision,updated_at=$now where id=$id',
        {
          id,
          name,
          definition: jsonText(next),
          revision: automationDefinitionRevision(next),
          now: this.context.now(),
        },
      );
      const after = this.byId(id);
      this.context.changed('automation_sequences', 'UPDATE', after, before);
      return after;
    });
  }
  remove(id: string, expectedRevision: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      if (before.revision !== expectedRevision)
        throw new ApiError('conflict', 'SequenceRevisionConflictError: Reload before deleting.');
      const references = [...this.list(), ...new AutomationsRepository(this.context).list()];
      for (const row of references) {
        if (row.id !== id && automationReferences(JSON_VALUE.parse(row.definition), id))
          throw new ApiError(
            'conflict',
            `Sequence is referenced by ${row.name}. Remove that reference first.`,
          );
      }
      this.context.sql.run('remove sequence', 'delete from automation_sequences where id=$id', {
        id,
      });
      this.context.changed('automation_sequences', 'DELETE', null, before);
    });
  }
  private identified(
    definition: AutomationSequenceDefinition,
    remap: boolean,
  ): AutomationSequenceDefinition {
    const next = AUTOMATION_SEQUENCE_DEFINITION.parse({
      ...definition,
      actions: identifyActions(definition.actions, () => this.context.newId(), remap),
    });
    for (const action of walkActions(next.actions))
      if (action.type === 'sequence') this.byId(action.sequenceId);
    return next;
  }
}
