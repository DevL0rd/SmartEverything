import { UpdateUnavailableError } from './command';

interface PublicAddress {
  readonly public_url: string | null;
  readonly public_url_verified_at: string | null;
}

export function verifiedHttpsServer(settings: PublicAddress): string | null {
  const server = settings.public_url_verified_at === null ? null : settings.public_url;
  return server === null || new URL(server).protocol !== 'https:' ? null : server;
}

export function httpsPublicServer(settings: PublicAddress): string {
  const server = verifiedHttpsServer(settings);
  if (server === null)
    throw new UpdateUnavailableError(
      'Set and verify the hub’s public HTTPS address before publishing an update.',
    );
  return server;
}
