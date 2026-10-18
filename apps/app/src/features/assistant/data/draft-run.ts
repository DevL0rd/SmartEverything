import type { Engine } from '@smarteverything/domain';
import { accessPill } from '../access/ai-access';
import { harnessHostName } from '../model/harness-context';
import { COMPUTER_ENGINE_LABELS, isComputerEngine } from '../provider/computer-engine';
import { useEngineCatalogue } from '../provider/provider-data';
import { useHarnessCatalogue } from './harness';

const HOME_HUB = 'Home Hub';

export interface DraftRun {
  readonly host: string;
  readonly access: string | null;
  readonly computer: boolean;
}

function computerAccess(engine: Extract<Engine, { kind: 'claude' | 'codex' }>): string {
  return engine.kind === 'claude'
    ? accessPill({ kind: 'claude', mode: engine.settings.permission_mode }).title
    : accessPill({
        kind: 'codex',
        sandbox: engine.settings.sandbox_policy,
        approval: engine.settings.approval_policy,
      }).title;
}

export function useDraftRun(engine: Engine): DraftRun {
  const harness = useHarnessCatalogue().data;
  const computers = useEngineCatalogue().data?.computers;
  if (isComputerEngine(engine)) {
    const computer = computers?.find(
      (entry) => entry.runtime === engine.kind && entry.device_id === engine.device_id,
    );
    return {
      host: computer?.name ?? COMPUTER_ENGINE_LABELS[engine.kind].name,
      access: computerAccess(engine),
      computer: true,
    };
  }
  if (engine.kind !== 'dsh') return { host: HOME_HUB, access: null, computer: false };
  const target = engine.execution_target;
  return {
    host: target.kind === 'server' ? HOME_HUB : harnessHostName(target, harness),
    access: accessPill({ kind: 'harness', permission: engine.permission }).title,
    computer: target.kind !== 'server',
  };
}
