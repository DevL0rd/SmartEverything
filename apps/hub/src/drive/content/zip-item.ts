export function isZipItem(item: { readonly name: string; readonly mime: string }): boolean {
  return item.mime === 'application/zip' || item.name.toLowerCase().endsWith('.zip');
}
