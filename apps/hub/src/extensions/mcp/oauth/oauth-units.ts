import { storeUnit } from '../../../store/host/unit';
import type { NewOAuthToken } from '../../../store/repositories/oauth';

export const OAUTH_ISSUE_UNIT = storeUnit((store, tokens: readonly NewOAuthToken[]): void => {
  store.oauth.forgetExpiredTokens();
  store.oauth.issue(tokens);
});

export const OAUTH_MAKE_ROOM_UNIT = storeUnit((store, since: string): number => {
  store.oauth.forgetUnapprovedBefore(since);
  return store.oauth.unapprovedSince(since);
});
