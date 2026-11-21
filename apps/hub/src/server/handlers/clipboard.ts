import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { SharedClipboard, type ClipboardCaller } from '../../clipboard/shared-clipboard';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { bound } from '../router';

function newClipboard({ store, live, log }: ServerContext, now: () => Date): SharedClipboard {
  return new SharedClipboard({
    store,
    now,
    log: log.child({ actorId: 'clipboard' }),
    announce: (notice, profileId): void => {
      live.profileNotice(notice, profileId, 'everyone');
    },
  });
}

const callerOf = (caller: Caller): ClipboardCaller => ({
  clientId: clientOf(caller).id,
  profileId: profileIdOf(caller),
});

const handlers = (clipboard: SharedClipboard) =>
  ({
    readSharedClipboard: bound(E.readSharedClipboard, ({ caller }) =>
      clipboard.read(callerOf(caller)),
    ),
    writeSharedClipboard: bound(E.writeSharedClipboard, ({ body, caller }) =>
      clipboard.write(callerOf(caller), body.text),
    ),
  }) as const;

export const clipboardRoutes = (context: ServerContext, now: () => Date) =>
  ({ ...handlers(newClipboard(context, now)) }) as const;
