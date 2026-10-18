import type { ReactNode } from 'react';
import type { ImageOperationReceipt } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { notify } from '../../../components/toast-store';
import { useImageActions, useImageOperations } from '../images/data/image-queries';
import { imageReceiptStatus } from '../images/model/image-receipt';

const isActive = (receipt: ImageOperationReceipt): boolean =>
  receipt.state === 'reserved' || receipt.state === 'running';

export function useActiveImageOperations(chatId: string): readonly ImageOperationReceipt[] {
  return (useImageOperations(chatId).data ?? []).filter(isActive);
}

export function BackgroundGroup({
  operations,
}: {
  readonly operations: readonly ImageOperationReceipt[];
}): ReactNode {
  const actions = useImageActions();
  return (
    <List title="Background">
      {operations.map((receipt) => (
        <ListRow
          key={receipt.id}
          icon="image"
          title={receipt.request.mode === 'edit' ? 'Editing a picture' : 'Making a picture'}
          subtitle={imageReceiptStatus(receipt)}
          trailing={
            <Button
              label="Cancel"
              variant="text"
              disabled={receipt.cancellation_requested}
              onPress={() => {
                actions.cancel(receipt.id).catch((error: unknown) => {
                  notify({
                    message: 'Cancellation could not be confirmed. Check receipt.',
                    error,
                    tone: 'critical',
                  });
                });
              }}
            />
          }
        />
      ))}
    </List>
  );
}
