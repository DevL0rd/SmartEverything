const LOOPBACK_WEB_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d{1,5}$/;

class DevelopmentOrigins extends Set<string> {
  override has(origin: string): boolean {
    return super.has(origin) || LOOPBACK_WEB_ORIGIN.test(origin);
  }
}

export function originAllowList(
  origins: readonly string[],
  development: boolean,
): ReadonlySet<string> {
  return development ? new DevelopmentOrigins(origins) : new Set(origins);
}
