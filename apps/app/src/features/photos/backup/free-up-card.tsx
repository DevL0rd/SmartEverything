import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { confirm } from '../../../components/confirm-store';
import { Icon } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useBackupStatus } from './model/status';
import type { Freeable, FreeableResult } from './runner/free-up';
import { useBackupHandle, type BackupHandle } from './handle';
import { freeUpBodyOf, freeUpConfirmOf, freeUpLabelOf } from './stats-model';

const log = new Logger('app.photos');

type Scan = FreeableResult | 'checking' | 'failed';

interface Scanned {
  readonly key: string;
  readonly scan: Scan;
}

function useFreeable(
  handle: BackupHandle,
  lastBackupAt: string | null,
): readonly [Scan, () => void] {
  const [scanned, setScanned] = useState<Scanned | null>(null);
  const [round, setRound] = useState(0);
  const key = `${lastBackupAt ?? ''}:${String(round)}`;
  useEffect(() => {
    let current = true;
    handle.runner
      .findFreeable()
      .then((result) => {
        if (current) setScanned({ key, scan: result });
      })
      .catch((error: unknown) => {
        log.warn('photos.free_up.scan_failed', {
          reason: error instanceof Error ? error.message : String(error),
        });
        if (current) setScanned({ key, scan: 'failed' });
      });
    return (): void => {
      current = false;
    };
  }, [handle, key]);
  const again = (): void => {
    setRound((value) => value + 1);
  };
  return [scanned?.key === key ? scanned.scan : 'checking', again] as const;
}

async function freeUp(handle: BackupHandle, freeable: Freeable, again: () => void): Promise<void> {
  if (!(await confirm(freeUpConfirmOf(freeable)))) return;
  const removed = await handle.runner.freeUp(freeable);
  notify({
    message: removed ? `${freeUpLabelOf(freeable)} done` : 'Nothing was removed from this phone',
    tone: removed ? 'positive' : 'default',
  });
  again();
}

function FreeUpBody({ handle }: { readonly handle: BackupHandle }): ReactNode {
  const [scan, again] = useFreeable(handle, useBackupStatus().lastBackupAt);
  const [busy, setBusy] = useState(false);
  if (scan === 'checking') {
    return (
      <Card>
        <Skeleton shape="text" />
      </Card>
    );
  }
  if (scan === 'failed' || scan.kind === 'unsupported' || scan.localIds.length === 0) return null;
  return (
    <Card>
      <View className="gap-3">
        <View className="flex-row items-start gap-3">
          <View className="size-10 items-center justify-center rounded-full bg-primary-container">
            <Icon name="smartphone" size={20} tone="primary" />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="body-strong">{freeUpLabelOf(scan)}</Text>
            <Text variant="footnote" tone="variant">
              {freeUpBodyOf(scan)}
            </Text>
          </View>
        </View>
        <Button
          label={freeUpLabelOf(scan)}
          variant="tonal"
          loading={busy}
          onPress={() => {
            setBusy(true);
            freeUp(handle, scan, again)
              .catch((error: unknown) => {
                notify({ message: 'Could not free up space', error, tone: 'critical' });
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        />
      </View>
    </Card>
  );
}

export function FreeUpCard(): ReactNode {
  const handle = useBackupHandle();
  return handle === null ? null : <FreeUpBody handle={handle} />;
}
