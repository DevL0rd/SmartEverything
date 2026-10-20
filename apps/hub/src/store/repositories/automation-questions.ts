import { AUTOMATION_QUESTION, type AutomationQuestion } from '@smarteverything/domain';
import { storedRow } from '../codec';
import { found, moment, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED = storedRow(AUTOMATION_QUESTION, { json: ['options'] });

const SELECT = `select q.id, q.automation_id, a.name as automation_name, q.run_id, q.person_id,
  q.question, q.options, q.state, q.answer, q.answered_by, q.deadline_at, q.created_at, q.answered_at
  from automation_questions q join automations a on a.id = q.automation_id`;

export interface QuestionWrite {
  readonly id: string;
  readonly automationId: string;
  readonly runId: string;
  readonly personId: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly deadlineAt: string | null;
}

export interface QuestionAnswer {
  readonly id: string;
  readonly answer: string;
  readonly answeredBy: string;
}

export class AutomationQuestionsRepository {
  constructor(private readonly context: StoreContext) {}

  open(write: QuestionWrite): AutomationQuestion {
    return this.context.write(() => {
      this.context.sql.run(
        'open an automation question',
        `insert into automation_questions(id,automation_id,run_id,person_id,question,options,state,deadline_at,created_at)
         values($id,$automationId,$runId,$personId,$question,$options,'open',$deadlineAt,$now)
         on conflict(id) do nothing`,
        {
          id: write.id,
          automationId: write.automationId,
          runId: write.runId,
          personId: write.personId,
          question: write.question,
          options: jsonText(write.options),
          deadlineAt: write.deadlineAt === null ? null : moment(write.deadlineAt),
          now: this.context.now(),
        },
      );
      return this.byId(write.id);
    });
  }

  byId(id: string): AutomationQuestion {
    return found(this.find(id), 'automation question', id);
  }

  find(id: string): AutomationQuestion | undefined {
    return this.context.sql.get(STORED, `${SELECT} where q.id=$id`, { id });
  }

  openFor(personId: string | null, now: string): AutomationQuestion[] {
    return this.context.sql.all(
      STORED,
      `${SELECT} where q.state='open' and ($personId is null or q.person_id=$personId)
         and (q.deadline_at is null or q.deadline_at > $now) order by q.created_at, q.id`,
      { personId, now: moment(now) },
    );
  }

  answer(write: QuestionAnswer): boolean {
    return (
      this.context.sql.run(
        'answer an automation question',
        `update automation_questions set state='answered', answer=$answer, answered_by=$answeredBy, answered_at=$now
         where id=$id and state='open'`,
        {
          id: write.id,
          answer: write.answer,
          answeredBy: write.answeredBy,
          now: this.context.now(),
        },
      ) > 0
    );
  }

  close(id: string): void {
    this.context.sql.run(
      'close an automation question',
      "update automation_questions set state='closed' where id=$id and state='open'",
      { id },
    );
  }

  closeRun(runId: string): number {
    return this.context.sql.run(
      'close the questions of a finished run',
      "update automation_questions set state='closed' where run_id=$runId and state='open'",
      { runId },
    );
  }
}
