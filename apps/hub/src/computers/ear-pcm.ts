export function pcmOfBase64(base64: string): Int16Array {
  const bytes = Buffer.from(base64, 'base64');
  return new Int16Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength - (bytes.length % 2)),
  );
}

export function base64OfPcm(pcm: Int16Array): string {
  return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64');
}
