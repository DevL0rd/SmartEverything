const CRLF = Buffer.from('\r\n');
const HEADER_END = Buffer.from('\r\n\r\n');

export function multipartBoundary(contentType: string): string | null {
  const match = /boundary="?([^";]+)"?/iu.exec(contentType);
  return match?.[1] ?? null;
}

export function splitMultipart(body: Uint8Array, boundary: string): readonly Uint8Array[] {
  const buffer = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  const delimiter = Buffer.from(`--${boundary}`);
  const parts: Uint8Array[] = [];
  let cursor = buffer.indexOf(delimiter);
  while (cursor >= 0) {
    const afterDelimiter = cursor + delimiter.length;
    if (buffer.subarray(afterDelimiter, afterDelimiter + 2).toString() === '--') return parts;
    const headersEnd = buffer.indexOf(HEADER_END, afterDelimiter);
    if (headersEnd < 0) return parts;
    const bodyStart = headersEnd + HEADER_END.length;
    const next = buffer.indexOf(Buffer.concat([CRLF, delimiter]), bodyStart);
    parts.push(buffer.subarray(bodyStart, next < 0 ? buffer.length : next));
    cursor = next < 0 ? -1 : next + CRLF.length;
  }
  return parts;
}
