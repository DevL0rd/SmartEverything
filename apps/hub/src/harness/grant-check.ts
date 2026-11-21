import { ApiError } from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { Store } from '../store/store';
import type { HarnessGrant } from './grant';

export function checkedGrant(
  store: Pick<Store, 'harnessSessions' | 'dshSessions' | 'aiChats'>,
  id: string,
): HarnessGrant {
  const grant = store.harnessSessions.grant(id);
  if (grant === undefined)
    throw new ApiError(
      'forbidden',
      'This native session has no active conversation execution grant.',
    );
  const metadata = store.dshSessions.stat(id, grant.profile_id);
  if (metadata === undefined)
    throw new ApiError('forbidden', 'This native session has no stored conversation.');
  const chat = store.aiChats.chat(metadata.chat_id);
  if (
    chat.profile_id !== grant.profile_id ||
    chat.engine.kind !== 'dsh' ||
    chat.engine.session_id !== id
  )
    throw new ApiError('forbidden', 'The conversation no longer authorizes this native session.');
  return grant;
}

export const GRANT_CHECK_UNIT = storeUnit(checkedGrant);
