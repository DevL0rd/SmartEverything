const STRAY_SUFFIX = /\.(lock|part|tmp|pid)$/;

export function isHubStray(name: string, knownNames: ReadonlySet<string>): boolean {
  if (STRAY_SUFFIX.test(name)) {
    return true;
  }
  for (const known of knownNames) {
    if (
      name.length > known.length + 1 &&
      name.startsWith(known) &&
      name.charAt(known.length) === '.'
    ) {
      return true;
    }
  }
  return false;
}
