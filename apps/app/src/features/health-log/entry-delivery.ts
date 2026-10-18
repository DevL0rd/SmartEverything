import { useEffect } from 'react';
import type { HealthRecordType } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { deliverEntries, isHealthConnectLinked } from '../../../modules/health-connect';
import { ValueStore, useValue } from '../../design/external-store';
import { entryChanges } from '../../queries/health-entries';
import { useRows, useSession } from '../../store/selectors';
import { friendlyError, rawErrorText } from '../../format/errors';

const log = new Logger('app.health-entries');

export type EntryWriteState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saved'; readonly written: number; readonly failed: number }
  | {
      readonly kind: 'needs_permission';
      readonly types: readonly HealthRecordType[];
      readonly waiting: number;
    }
  | { readonly kind: 'failed'; readonly reason: string };

const writeState = new ValueStore<EntryWriteState>({ kind: 'idle' });

export function useEntryWriteState(): EntryWriteState {
  return useValue(writeState);
}

export async function retryHealthConnectEntries(): Promise<void> {
  try {
    const report = await deliverEntries();
    writeState.set(
      report.missingTypes.length > 0
        ? { kind: 'needs_permission', types: report.missingTypes, waiting: report.waiting }
        : { kind: 'saved', written: report.written, failed: report.failed },
    );
  } catch (error) {
    log.warn('entries.not_saved_to_health_connect', { reason: String(error) });
    writeState.set({
      kind: 'failed',
      reason: friendlyError(error) ?? rawErrorText(error),
    });
  }
}

function useThisPhoneConnected(): boolean {
  const clientId = useSession().client.id;
  return useRows('health_sources').some((source) => source.client_id === clientId);
}

export function EntryDeliveryHost(): null {
  const changes = useValue(entryChanges);
  const connected = useThisPhoneConnected();
  useEffect(() => {
    if (isHealthConnectLinked && connected) {
      background(retryHealthConnectEntries(), 'health_connect_entries.retry_failed');
    }
  }, [changes, connected]);
  return null;
}
