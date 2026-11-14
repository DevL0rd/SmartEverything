import { useMemo } from 'react';
import type { AutomationRow } from '../data/graph-adapter';
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
  readonly remove: (automationId: string, name: string, onRemoved?: () => void) => void;
}

async function attempt(failure: string, work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch (error) {
    log.error('automations.list_action_failed', error, { failure });
    notify({ message: failure, tone: 'critical', error });
    return false;
  }
}

interface Services {
  readonly programs: ReturnType<typeof useAutomationActions>;
  readonly runs: ReturnType<typeof useRunActions>;
  readonly current: () => {
    readonly byId: ReadonlyMap<string, AutomationRow>;
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
        definition: source.graph,
        layout: source.layout,
      }),
    ),
    'automations.duplicate_failed',
  );
}

export async function removeAutomation(
  remove: (automationId: string) => Promise<unknown>,
  automationId: string,
  name: string,
  onRemoved: (() => void) | undefined,
): Promise<void> {
  const accepted = await confirm({
    title: `Delete ${name}?`,
    confirmLabel: 'Delete',
    tone: 'destructive',
  });
  if (!accepted) return;
  const removed = await attempt(
    `${name} wasn’t deleted. Another automation may still call it.`,
    () => remove(automationId),
  );
  if (removed) onRemoved?.();
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
      remove: (automationId, name, onRemoved): void => {
        background(
          removeAutomation((id) => programs.remove(id), automationId, name, onRemoved),
          'automations.remove_failed',
        );
      },
    };
  }, [programs, runs, automations]);
}
