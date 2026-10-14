import type { CodexProviderTurn } from '@smarteverything/domain';
import type { CodexJob } from './job';
import { CodexRuntimeError } from './errors';
export class CodexAdmission {
  private readonly submissions = new Set<string>();
  private readonly starting = new Set<string>();
  private readonly controls = new Set<string>();
  constructor(
    private readonly deviceId: string,
    private readonly jobs: ReadonlyMap<string, CodexJob>,
  ) {}
  reserve(turn: CodexProviderTurn): void {
    if (turn.device_id !== this.deviceId)
      throw new CodexRuntimeError('provider_start', 'The Codex work addresses another computer.');
    if (this.submissions.has(turn.job_id) || this.submissions.size >= 10_000)
      throw new CodexRuntimeError(
        'provider_start',
        'This Codex job cannot be replayed or exceeds submission capacity.',
      );
    if (this.busy(turn.chat_id))
      throw new CodexRuntimeError(
        'provider_start',
        'This chat already has active Codex work or a control operation.',
      );
    if (this.starting.size + [...this.jobs.values()].filter((job) => job.active).length >= 32)
      throw new CodexRuntimeError(
        'provider_start',
        'The selected computer has reached its Codex active job limit.',
      );
    this.submissions.add(turn.job_id);
    this.starting.add(turn.chat_id);
  }
  release(chatId: string): void {
    this.starting.delete(chatId);
  }
  control(job: CodexJob): () => void {
    if (this.busy(job.turn.chat_id))
      throw new CodexRuntimeError(
        'provider_control',
        'Wait for Codex work and controls to finish.',
      );
    this.controls.add(job.turn.chat_id);
    return (): void => {
      this.controls.delete(job.turn.chat_id);
    };
  }
  busy(chatId: string): boolean {
    return (
      this.starting.has(chatId) ||
      this.controls.has(chatId) ||
      [...this.jobs.values()].some((job) => job.turn.chat_id === chatId && job.active)
    );
  }
}
