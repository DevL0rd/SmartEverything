import { replaceEqualDeep, type QueryClient } from '@tanstack/react-query';
import { noticeHandler, type NoticeOf } from '../../../store/notice-registry';
import { background } from '@smarteverything/logging';
import type { ClaudeNotice, ClaudeSession } from '@smarteverything/domain';

type ComputerNotice = NoticeOf<
  'computer_ai_status' | 'computer_claude' | 'computer_runtime_status' | 'computer_runtime_native'
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

function receiveAiNotice(
  client: QueryClient,
  message: NoticeOf<'computer_ai_status' | 'computer_claude'>,
): void {
  const deviceId =
    message.type === 'computer_ai_status' ? message.status.device_id : message.device_id;
  const key = ['window', 'computer-ai', deviceId];
  if (message.type === 'computer_claude' && message.notice.type === 'claude_operation') {
    const operation = message.notice.operation;
    client.setQueryData([...key, 'operation', operation.id], operation);
    if (operation.state === 'pending' || operation.state === 'uncertain') return;
  }
  if (message.type === 'computer_ai_status') {
    const statusKey = [...key, 'status'];
    const previous = client.getQueryData(statusKey);
    if (replaceEqualDeep(previous, message.status) === previous) return;
    client.setQueryData(statusKey, message.status);
    background(
      client.invalidateQueries({ queryKey: ['window', 'ai-engines'] }),
      'queries.invalidate_failed',
    );
  }
  if (message.type === 'computer_claude' && message.notice.type !== 'claude_operation') {
    receiveClaudeNotice(client, key, message.notice);
    return;
  }
  background(client.invalidateQueries({ queryKey: key }), 'queries.invalidate_failed');
}

function patchSessionLists(
  client: QueryClient,
  key: readonly string[],
  change: { readonly id: string; readonly session: ClaudeSession | null },
): void {
  const { id, session } = change;
  for (const archived of [false, true]) {
    const listKey = [...key, 'sessions', String(archived)];
    const list = client.getQueryData<ClaudeSession[]>(listKey);
    if (list === undefined) continue;
    const listed = list.some((row) => row.id === id);
    if (session?.archived !== archived) {
      if (listed)
        client.setQueryData(
          listKey,
          list.filter((row) => row.id !== id),
        );
    } else if (listed)
      client.setQueryData(
        listKey,
        list.map((row) => (row.id === id ? session : row)),
      );
    else background(client.invalidateQueries({ queryKey: listKey }), 'queries.invalidate_failed');
  }
}

function receiveClaudeNotice(
  client: QueryClient,
  key: readonly string[],
  notice: Exclude<ClaudeNotice, { type: 'claude_operation' }>,
): void {
  switch (notice.type) {
    case 'claude_thread':
      background(
        client.invalidateQueries({ queryKey: [...key, 'session', notice.session_id] }),
        'queries.invalidate_failed',
      );
      return;
    case 'claude_session':
      patchSessionLists(client, key, { id: notice.session.id, session: notice.session });
      return;
    case 'claude_session_gone':
      patchSessionLists(client, key, { id: notice.id, session: null });
      return;
    case 'claude_status':
      client.setQueryData([...key, 'native-status'], notice.status);
      return;
  }
}

export const COMPUTER_NOTICES = noticeHandler(
  ['computer_ai_status', 'computer_claude', 'computer_runtime_status', 'computer_runtime_native'],
  (message: ComputerNotice, { client }) => {
    if (message.type === 'computer_runtime_status' || message.type === 'computer_runtime_native')
      receiveRuntimeNotice(client, message);
    else receiveAiNotice(client, message);
  },
);
