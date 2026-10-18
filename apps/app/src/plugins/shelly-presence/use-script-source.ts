import { useState } from 'react';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import type { ShellyDevice } from '@smarteverything/shelly';
import { z } from 'zod';
import { pickTextFile } from '../../platform/text-file';
import { operatePresence } from './presence-operation';
import { failure } from './use-presence-operation';

const SCRIPT_CODE = z.object({ code: z.string(), status: JSON_VALUE.optional() });

export interface ScriptSourceDraft {
  readonly source: string | null;
  readonly change: (value: string) => void;
  readonly status: JsonValue | null;
  readonly error: string | null;
  readonly load: () => void;
  readonly importFile: () => void;
}

export function useScriptSource(sensor: ShellyDevice, id: number): ScriptSourceDraft {
  const [source, change] = useState<string | null>(null);
  const [status, setStatus] = useState<JsonValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const failed = (caught: unknown): void => {
    setError(failure(caught));
  };
  const load = (): void => {
    operatePresence(sensor, { action: 'script_code', params: { id } })
      .then((outcome) => {
        if (outcome.state !== 'accepted') throw new Error(outcome.message);
        const script = SCRIPT_CODE.parse(outcome.result);
        change(script.code);
        setStatus(script.status ?? null);
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
