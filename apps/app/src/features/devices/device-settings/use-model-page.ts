import { useState } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type DeviceModels,
  type ModelAssetStored,
  type ModelOverrideInput,
  type ModelOverrideRow,
  type ModelOverrideScope,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { notifyFailure } from '../../../components/toast-store';
import { base64Of } from '../../../format/base64';
import { pickFiles } from '../../../platform/pick-files';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useRows } from '../../../store/selectors';
import { activeScopeOf, finishInput, uploadKindOf } from '../../models';

const log = new Logger('app.models');

const CHANGE_FAILED = 'The model did not change';

const UPLOAD_FAILED = 'The model file was not uploaded';

export function overridesFingerprint(rows: readonly ModelOverrideRow[]): string {
  return rows.map((row) => `${row.scope}\n${row.target}\n${row.updated_at}`).join('\n');
}

export function deviceModelsQueryKey(deviceId: string, fingerprint: string): readonly unknown[] {
  return ['window', 'models', 'device-models', deviceId, fingerprint];
}

export interface ModelPage {
  readonly query: UseQueryResult<DeviceModels>;
  readonly scope: ModelOverrideScope;
  readonly setScope: (scope: ModelOverrideScope) => void;
  readonly busy: boolean;
  readonly choose: (modelId: string) => void;
  readonly pickFinish: (models: DeviceModels, finish: string) => void;
  readonly reset: (scope: ModelOverrideScope) => void;
  readonly upload: () => void;
}

async function uploadPicked(): Promise<ModelAssetStored | null> {
  const [file] = await pickFiles('files');
  if (file === undefined) return null;
  const buffer = await file.data();
  const kind = uploadKindOf(file.name, new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)));
  const data = base64Of(buffer, 0, buffer.byteLength);
  const stored = await api().call(E.uploadModelAsset, { body: { kind, data } });
  log.info('model_asset.uploaded', { kind, size: stored.size });
  return stored;
}

function useScopeState(
  query: UseQueryResult<DeviceModels>,
): [ModelOverrideScope, (scope: ModelOverrideScope) => void] {
  const [picked, setPicked] = useState<ModelOverrideScope | null>(null);
  const active = query.data === undefined ? null : activeScopeOf(query.data.model.source);
  return [picked ?? active ?? 'device', setPicked];
}

type Actions = Pick<ModelPage, 'choose' | 'pickFinish' | 'reset' | 'upload'>;

interface Runner {
  readonly deviceId: string;
  readonly scope: ModelOverrideScope;
  readonly run: (work: () => Promise<unknown>, message: string, event: string) => void;
}

function actionsOf({ deviceId, scope, run }: Runner): Actions {
  const params = { deviceId };
  const set = (body: ModelOverrideInput): Promise<unknown> =>
    api().call(E.setDeviceModelOverride, { params, body });
  return {
    choose: (modelId): void => {
      run(() => set({ scope, model_id: modelId }), CHANGE_FAILED, 'models.override_failed');
    },
    pickFinish: (models, finish): void => {
      const body = finishInput(models, scope, finish);
      if (body !== null) run(() => set(body), CHANGE_FAILED, 'models.finish_failed');
    },
    reset: (resetScope): void => {
      const reset = (): Promise<unknown> =>
        api().call(E.resetDeviceModelOverride, { params, query: { scope: resetScope } });
      run(reset, CHANGE_FAILED, 'models.reset_failed');
    },
    upload: (): void => {
      const work = async (): Promise<void> => {
        const stored = await uploadPicked();
        if (stored !== null) await set({ scope, asset_hash: stored.sha256 });
      };
      run(work, UPLOAD_FAILED, 'models.upload_failed');
    },
  };
}

export function useModelPage(deviceId: string): ModelPage {
  const client = useQueryClient();
  const fingerprint = overridesFingerprint(useRows('model_overrides'));
  const queryKey = deviceModelsQueryKey(deviceId, fingerprint);
  const query = useScreenQuery({
    queryKey,
    queryFn: () => api().call(E.readDeviceModels, { params: { deviceId } }),
  });
  const [scope, setScope] = useScopeState(query);
  const [busy, setBusy] = useState(false);
  const run = (work: () => Promise<unknown>, message: string, event: string): void => {
    setBusy(true);
    const job = work()
      .then(() => client.invalidateQueries({ queryKey }))
      .catch((error: unknown) => {
        notifyFailure(message)(error);
        throw error;
      })
      .finally(() => {
        setBusy(false);
      });
    background(job, event, { deviceId });
  };
  return { query, scope, setScope, busy, ...actionsOf({ deviceId, scope, run }) };
}
