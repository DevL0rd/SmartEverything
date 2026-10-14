import { useState } from 'react';
import type { ShellyOperationResult, ShellyPresenceDevice } from '@smarteverything/domain';
import { pickTextFile } from '../../platform/text-file';
import { operatePresence } from './presence-data';

type ScriptStatus = NonNullable<
  Extract<ShellyOperationResult, { readonly kind: 'script_code' }>['value']['status']
>;
export interface ScriptSourceDraft {
  readonly source: string | null;
  readonly change: (value: string) => void;
  readonly status: ScriptStatus | null;
  readonly error: string | null;
  readonly load: () => void;
  readonly importFile: () => void;
}

export function useScriptSource(sensor: ShellyPresenceDevice, id: number): ScriptSourceDraft {
  const [source, change] = useState<string | null>(null);
  const [status, setStatus] = useState<ScriptStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const failed = (caught: unknown): void => {
    setError(caught instanceof Error ? caught.message : String(caught));
  };
  const load = (): void => {
    operatePresence(sensor, { action: 'script_code', id })
      .then((outcome) => {
        if (outcome.state !== 'accepted' || outcome.result?.kind !== 'script_code')
          throw new Error('The sensor did not return script source.');
        change(outcome.result.value.code);
        setStatus(outcome.result.value.status ?? null);
        setError(null);
      })
      .catch(failed);
  };
  const importFile = (): void => {
    pickTextFile('application/javascript,text/javascript,text/plain')
      .then((code) => {
        if (code !== null) {
          change(code);
          setError(null);
        }
      })
      .catch(failed);
  };
  return { source, change, status, error, load, importFile };
}
