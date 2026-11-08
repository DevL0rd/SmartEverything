import { Logger, messageOf } from '@smarteverything/logging';

const log = new Logger('desktop.main');

export interface ShutdownStep {
  readonly name: string;
  readonly run: () => unknown;
}

export async function runShutdown(steps: readonly ShutdownStep[]): Promise<void> {
  const outcomes = await Promise.allSettled(
    steps.map(async (step) => {
      await step.run();
    }),
  );
  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'rejected') {
      log.error('app.shutdown_step_failed', outcome.reason, {
        step: steps[index]?.name ?? 'unknown',
        reason: messageOf(outcome.reason),
      });
    }
  });
}
