import { randomUUID } from 'node:crypto';
import { DSH_SESSION_EVENTS_WRITE } from '@smarteverything/domain';
import type { Rig } from './rig';
import { storedHistory, type SeededConversation } from './native-conversation';

const ATTACHMENT = {
  attachmentId: 'a'.repeat(64),
  mediaType: 'image/png',
  bytes: 10,
  width: 1,
  height: 1,
};

export function appendOffloadedImage(rig: Rig, seeded: SeededConversation): void {
  const reopened = rig.service.prepare(rig.owner, seeded.chat.id, rig.authority, rig.clientId);
  const next = storedHistory(rig, seeded.sessionId).length;
  rig.opened.store.dshSessions.append(
    {
      claim: reopened.claim,
      operation_id: randomUUID(),
      events: DSH_SESSION_EVENTS_WRITE.parse([
        { type: 'turn/start', seq: next, time: 9_000, data: { turn: 9 } },
        { type: 'step/start', seq: next + 1, time: 9_001, data: { turn: 9, step: 0 } },
        {
          type: 'user/message',
          seq: next + 2,
          time: 9_002,
          surfaceOp: 'append',
          data: {
            id: randomUUID(),
            role: 'user',
            source: { kind: 'user' },
            content: [{ type: 'image', attachment: ATTACHMENT }],
          },
        },
        { type: 'step/end', seq: next + 3, time: 9_003, data: { turn: 9, step: 0 } },
        {
          type: 'turn/end',
          seq: next + 4,
          time: 9_004,
          data: { turn: 9, reason: { kind: 'completed' } },
        },
        {
          type: 'image/offload',
          seq: next + 5,
          time: 9_005,
          data: { targets: [{ seq: next + 2, imageIndexes: [0] }] },
        },
      ]),
    },
    rig.service.hostPrincipal(
      rig.owner.profileId,
      rig.service.directory.get({ kind: 'server' }).host,
    ),
  );
}
