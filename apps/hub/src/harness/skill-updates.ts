import type { HarnessSkillUpdateResult, HarnessSkillUpdates } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { Clock, Cancel } from '../clock';
import type { HostedRepository } from '../store/host/hosted';
import type { HarnessConfigurationService } from './configuration';
import type { HarnessExtensions } from './extensions';

const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class HarnessSkillUpdatesService {
  private pending: Promise<HarnessSkillUpdateResult> | undefined;
  private cancel: Cancel | undefined;
  private running = false;
  private readonly log = new Logger('hub.harness-skill-updates');

  constructor(
    private readonly repository: HostedRepository<'harnessSkillUpdates', 'read' | 'replace'>,
    private readonly configuration: HarnessConfigurationService,
    private readonly extensions: HarnessExtensions,
    private readonly clock: Clock,
  ) {}

  read(): Promise<HarnessSkillUpdates> {
    return this.repository.read();
  }

  async replace(input: unknown): Promise<HarnessSkillUpdates> {
    const result = await this.repository.replace(input);
    this.configuration.notifySettings();
    if (result.automatic && this.running) this.automatic();
    return result;
  }

  update(): Promise<HarnessSkillUpdateResult> {
    this.pending ??= this.sync().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.extensions.update('missing').catch((cause: unknown) => {
      this.log.error('updates.fetch_missing_failed', cause);
    });
    this.automatic();
    this.schedule();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.cancel?.();
    this.cancel = undefined;
    await this.pending?.catch((cause: unknown) => {
      this.log.error('updates.stop_failed', cause);
    });
  }

  private automatic(): void {
    void this.automaticUpdate().catch((cause: unknown) => {
      this.log.error('updates.failed', cause);
    });
  }

  private async automaticUpdate(): Promise<void> {
    if (!(await this.read()).automatic) return;
    await this.update();
  }

  private schedule(): void {
    this.cancel = this.clock.at(new Date(this.clock.now().getTime() + UPDATE_INTERVAL_MS), () => {
      if (!this.running) return;
      this.automatic();
      this.schedule();
    });
  }

  private async sync(): Promise<HarnessSkillUpdateResult> {
    const counts = await this.extensions.update('all');
    return { ...counts, revision: this.configuration.desired().revision };
  }
}
