import { readBuildEnv } from '../../platform/build-env';

class AppConfigError extends Error {
  override readonly name = 'AppConfigError';

  constructor(
    readonly what: string,
    readonly received: string,
  ) {
    super(`The app configuration is unusable: ${what}. Received ${received}.`);
  }
}

let devServer: { readonly url: string | null } | null = null;

export function devServerUrl(): string | null {
  if (devServer !== null) {
    return devServer.url;
  }
  const parsed = readBuildEnv();
  if (!parsed.success) {
    throw new AppConfigError(
      'EXPO_PUBLIC_DEV_SERVER_URL must be an http(s) URL',
      parsed.error.message,
    );
  }
  const url = parsed.data.devServerUrl?.replace(/\/$/, '') ?? null;
  if (url !== null && !__DEV__) {
    throw new AppConfigError(
      'EXPO_PUBLIC_DEV_SERVER_URL is only for development builds, and this is a release build',
      url,
    );
  }
  devServer = { url };
  return url;
}
