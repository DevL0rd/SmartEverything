import { useMemo } from 'react';
import type { AutomationRowV3 } from '@smarteverything/domain';
import { background, Logger } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { useAutomationActions } from '../data/use-automation';
import { listOf } from '../data/automation-rows';
import { useAutomationsSource } from '../data/source';
import { useRunActions } from '../data/use-runs';
import { copyName } from './copy-name';

const log = new Logger('app.automations');

export interface ListActions {
  readonly toggle: (automationId: string, enabled: boolean) => void;
  readonly run: (automationId: string, mode: 'live' | 'dry') => void;
  readonly duplicate: (automationId: string) => void;
  readonly remove: (automationId: string, name: string) => void;
}

async function attempt(failure: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    log.error('automations.list_action_failed', error, { failure });
    notify({ message: failure, tone: 'critical', error });
  }
}

interface Services {
  readonly programs: ReturnType<typeof useAutomationActions>;
  readonly runs: ReturnType<typeof useRunActions>;
  readonly current: () => {
    readonly byId: ReadonlyMap<string, AutomationRowV3>;
    readonly names: readonly string[];
  };
}

function duplicateOf(services: Services, automationId: string): void {
  const source = services.current().byId.get(automationId);
  if (source === undefined) return;
  background(
    attempt('The automation wasn’t duplicated', () =>
      services.programs.create({
        name: copyName(source.name, services.current().names),
        enabled: false,
        definition: source.definition,
        layout: source.layout,
      }),
    ),
    'automations.duplicate_failed',
  );
}

function removal(services: Services, automationId: string, name: string): void {
  background(
    confirm({ title: `Delete ${name}?`, confirmLabel: 'Delete', tone: 'destructive' }).then(
      (accepted) =>
        accepted
          ? attempt(`${name} wasn’t deleted. Another automation may still call it.`, () =>
              services.programs.remove(automationId),
            )
          : undefined,
    ),
    'automations.remove_failed',
  );
}

function runOf(services: Services, automationId: string, mode: 'live' | 'dry'): void {
  background(
    attempt('The automation didn’t start', async () => {
      await services.runs.start({ automationId, mode });
      notify({ message: mode === 'dry' ? 'Test started' : 'Started', tone: 'positive' });
    }),
    'automations.run_failed',
  );
}

export function useListActions(): ListActions {
  const programs = useAutomationActions();
  const runs = useRunActions();
  const { automations } = useAutomationsSource();
  return useMemo((): ListActions => {
    const services: Services = {
      programs,
      runs,
      current: () => {
        const { rows, byId } = listOf(automations.snapshot());
        return { byId, names: rows.map((row) => row.name) };
      },
    };
    return {
      toggle: (automationId, enabled): void => {
        background(
          attempt('The automation didn’t change', () => programs.setEnabled(automationId, enabled)),
          'automations.toggle_failed',
        );
      },
      run: (automationId, mode): void => {
        runOf(services, automationId, mode);
      },
      duplicate: (automationId): void => {
        duplicateOf(services, automationId);
      },
      remove: (automationId, name): void => {
        removal(services, automationId, name);
      },
    };
  }, [programs, runs, automations]);
}
