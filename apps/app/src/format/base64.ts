export function base64Of(buffer: ArrayBuffer, start: number, end: number): string {
  const view = new Uint8Array(buffer, start, end - start);
  let binary = '';
  for (let index = 0; index < view.length; index += 0x8000) {
    binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
