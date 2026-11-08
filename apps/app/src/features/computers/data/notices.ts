import { replaceEqualDeep, type QueryClient } from '@tanstack/react-query';
import { noticeHandler, type NoticeOf } from '../../../store/notice-registry';
import { background } from '@smarteverything/logging';

type ComputerNotice = NoticeOf<
  'computer_ai_status' | 'computer_runtime_status' | 'computer_runtime_native'
>;

function receiveRuntimeNotice(
  client: QueryClient,
  message: NoticeOf<'computer_runtime_status' | 'computer_runtime_native'>,
): void {
  const deviceId =
    message.type === 'computer_runtime_status' ? message.status.device_id : message.device_id;
  background(
    client.invalidateQueries({ queryKey: ['window', 'computer-runtime', deviceId] }),
    'queries.invalidate_failed',
  );
  background(
    client.invalidateQueries({ queryKey: ['window', 'ai-engines'] }),
    'queries.invalidate_failed',
  );
}

function receiveAiNotice(client: QueryClient, message: NoticeOf<'computer_ai_status'>): void {
  const key = ['window', 'computer-ai', message.status.device_id];
  const statusKey = [...key, 'status'];
  const previous = client.getQueryData(statusKey);
  if (replaceEqualDeep(previous, message.status) === previous) return;
  client.setQueryData(statusKey, message.status);
  background(
    client.invalidateQueries({ queryKey: ['window', 'ai-engines'] }),
    'queries.invalidate_failed',
  );
  background(client.invalidateQueries({ queryKey: key }), 'queries.invalidate_failed');
}

export const COMPUTER_NOTICES = noticeHandler(
  ['computer_ai_status', 'computer_runtime_status', 'computer_runtime_native'],
  (message: ComputerNotice, { client }) => {
    if (message.type === 'computer_runtime_status' || message.type === 'computer_runtime_native')
      receiveRuntimeNotice(client, message);
    else receiveAiNotice(client, message);
  },
);
