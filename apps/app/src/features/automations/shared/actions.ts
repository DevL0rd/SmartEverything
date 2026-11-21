import { Logger, background } from '@smarteverything/logging';
import { setAutomationEnabled } from '../../../api/automations';
import { notify } from '../../../components/toast-store';
import type { EntityStore } from '../../../store/entity-store';
import { hubSource } from '../data/source';

const log = new Logger('app.automations');

export async function attempt(
  failure: string,
  work: () => Promise<unknown>,
  context: Readonly<Record<string, unknown>> = {},
): Promise<boolean> {
  const operation = log.operation('automation.action', context);
  try {
    await work();
    operation.succeeded();
    return true;
  } catch (error) {
    operation.failed(error, { failure });
    notify({ message: failure, tone: 'critical', error });
    return false;
  }
}

export function toggleAutomation(store: EntityStore, automationId: string, enabled: boolean): void {
  background(
    attempt(
      'The automation didn’t change',
      () =>
        hubSource(store).write({
          event: 'automation.enable',
          automationId,
          change: (row) => ({ ...row, enabled }),
          send: () => setAutomationEnabled(automationId, enabled),
        }),
      { action: 'toggle', automationId, enabled },
    ),
    'actions.attempt_failed',
  );
}
