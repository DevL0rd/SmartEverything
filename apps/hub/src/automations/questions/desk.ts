import { ApiError } from '@smarteverything/domain';
import type { AutomationQuestion } from '@smarteverything/domain';
import type { WaitResume } from '@smarteverything/flow/interpret/waits';
import type { Wait } from '@smarteverything/flow/state/run-state';
import type { Cancel, Clock } from '../../clock';
import type {
  AutomationQuestionsRepository,
  QuestionWrite,
} from '../../store/repositories/automation-questions';

export interface Answerer {
  readonly profileId: string;
  readonly owner: boolean;
}

export type AnswerWait = Extract<Wait, { kind: 'answer' }>;

export interface AnswerFeed {
  readonly watch: (wait: AnswerWait, resume: (resume: WaitResume) => void) => Cancel;
}

export interface DeskPorts {
  readonly questions: Pick<
    AutomationQuestionsRepository,
    'open' | 'find' | 'openFor' | 'answer' | 'close' | 'closeRun'
  >;
  readonly clock: Pick<Clock, 'now'>;
}

type Listener = (resume: WaitResume) => void;

function resumeOf(question: AutomationQuestion): WaitResume | undefined {
  if (question.state !== 'answered' || question.answer === null) return undefined;
  return {
    kind: 'answer',
    answer: question.answer,
    ...(question.answered_by === null ? {} : { by: question.answered_by }),
  };
}

export class QuestionDesk implements AnswerFeed {
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(private readonly ports: DeskPorts) {}

  open(write: QuestionWrite): AutomationQuestion {
    return this.ports.questions.open(write);
  }

  pending(personId: string | null): AutomationQuestion[] {
    return this.ports.questions.openFor(personId, this.ports.clock.now().toISOString());
  }

  close(id: string): void {
    this.ports.questions.close(id);
  }

  closeRun(runId: string): void {
    this.ports.questions.closeRun(runId);
  }

  watch = (wait: AnswerWait, resume: Listener): Cancel => {
    const id = wait.notificationId;
    const held = this.listeners.get(id) ?? new Set<Listener>();
    held.add(resume);
    this.listeners.set(id, held);
    const stored = this.ports.questions.find(id);
    const answered = stored === undefined ? undefined : resumeOf(stored);
    if (answered !== undefined) {
      queueMicrotask(() => {
        resume(answered);
      });
    }
    return () => {
      held.delete(resume);
      if (held.size === 0) this.listeners.delete(id);
    };
  };

  answer(id: string, by: Answerer, answer: string): AutomationQuestion {
    const question = this.ports.questions.find(id);
    if (question === undefined) throw new ApiError('not_found', 'There is no such question.');
    this.requireAnswerable(question, by, answer);
    const recorded = this.ports.questions.answer({ id, answer, answeredBy: by.profileId });
    if (!recorded) throw new ApiError('conflict', 'This question was just answered.');
    const resume: WaitResume = { kind: 'answer', answer, by: by.profileId };
    for (const listener of [...(this.listeners.get(id) ?? [])]) listener(resume);
    return this.ports.questions.find(id) ?? question;
  }

  private requireAnswerable(question: AutomationQuestion, by: Answerer, answer: string): void {
    if (!by.owner && question.person_id !== by.profileId) {
      throw new ApiError('not_found', 'There is no such question.');
    }
    if (question.state !== 'open') {
      throw new ApiError('conflict', 'This question is no longer waiting for an answer.');
    }
    const due = question.deadline_at;
    if (due !== null && Date.parse(due) <= this.ports.clock.now().getTime()) {
      throw new ApiError('conflict', 'The time to answer this question has run out.');
    }
    if (!question.options.includes(answer)) {
      throw new ApiError('invalid_request', `Answer with one of: ${question.options.join(', ')}.`);
    }
  }
}
