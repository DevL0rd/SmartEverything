export function fileNameOf(relPath: string): string {
  return relPath.split('/').at(-1) ?? relPath;
}
