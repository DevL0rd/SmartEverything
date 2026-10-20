import type { WaitResume } from '@smarteverything/flow/interpret/waits';
import type { Cancel } from '../../clock';
import type { AnswerFeed, AnswerWait } from '../questions/desk';

interface Asked {
  readonly wait: AnswerWait;
  readonly resume: (resume: WaitResume) => void;
}

export class SimAnswers implements AnswerFeed {
  private readonly asked = new Set<Asked>();

  watch = (wait: AnswerWait, resume: (resume: WaitResume) => void): Cancel => {
    const entry: Asked = { wait, resume };
    this.asked.add(entry);
    return () => {
      this.asked.delete(entry);
    };
  };

  answer(text: string): void {
    for (const entry of [...this.asked]) {
      if (entry.wait.options.includes(text)) entry.resume({ kind: 'answer', answer: text });
    }
  }
}
