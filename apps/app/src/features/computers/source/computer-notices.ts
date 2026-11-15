import type { QueryClient } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import type { NoticeOf } from '../../../store/notice-registry';
import { listKey } from './computer-keys';

export function receiveFilesNotice(
  client: QueryClient,
  message: NoticeOf<'computer_files_changed'>,
): void {
  background(
    client.invalidateQueries({ queryKey: listKey(message.deviceId, message.path) }),
    'queries.invalidate_failed',
  );
}
