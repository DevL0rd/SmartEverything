import { act } from 'react';
import { AI_CHAT_ROW, type AiRepairAdmission } from '@smarteverything/domain';

export const CHAT = AI_CHAT_ROW.parse({
  id: '0e000000-0000-4000-8000-0000000000c1',
  profile_id: '0e000000-0000-4000-8000-000000000001',
  kind: 'chat',
  title: 'AI repair',
  icon: null,
  parent_id: null,
  source_key: 'ai-repair',
  engine: {
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: null,
    model: 'fixture',
    model_route_id: '0e000000-0000-4000-8000-000000000002',
  },
  tools: null,
  pinned: false,
  memory: false,
  archived_at: null,
  cost_micros: 0,
  last_message_at: null,
  created_at: '2026-11-08T00:00:00Z',
  updated_at: '2026-11-08T00:00:00Z',
});
export const ADMITTED: AiRepairAdmission = {
  kind: 'queued',
  eventId: '0e000000-0000-4000-8000-000000000003',
  chatId: CHAT.id,
};
export const FINGERPRINT = 'a'.repeat(64);

export async function settled(run: () => void): Promise<void> {
  act(() => {
    run();
  });
  await act(async () => {
    await new Promise<void>((done) => {
      setTimeout(done, 0);
    });
  });
}

export function pending<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
