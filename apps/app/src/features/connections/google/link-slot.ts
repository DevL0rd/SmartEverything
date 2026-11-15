import type { GoogleClientPlatform } from './google-app-setup';

export interface GoogleLinkState {
  readonly busy: boolean;
  readonly refusedClient: GoogleClientPlatform | null;
  readonly start: () => void;
}
