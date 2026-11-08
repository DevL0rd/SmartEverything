const BOUNDARY = /^[0-9A-Za-z'()+_,\-./:=?]{1,70}$/u;

export class MultipartBoundaryError extends Error {
  override readonly name = 'MultipartBoundaryError';

  constructor(expected: string, received: string) {
    super(`A multipart boundary must be ${expected}; received ${received}`);
  }
}

export interface MultipartPart {
  readonly name: string;
  readonly contentType: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface MultipartBody {
  readonly contentType: string;
  readonly bytes: Buffer;
}

function lineBreakFree(label: string, value: string): string {
  if (/[\r\n]/u.test(value)) {
    throw new MultipartBoundaryError(`a ${label} on one line`, JSON.stringify(value));
  }
  return value;
}

function headLines(part: MultipartPart): readonly string[] {
  const extra = Object.entries(part.headers ?? {}).map(
    ([name, value]) =>
      `${lineBreakFree('header name', name)}: ${lineBreakFree('header value', value)}`,
  );
  return [
    `content-disposition: form-data; name="${lineBreakFree('part name', part.name)}"`,
    `content-type: ${lineBreakFree('content type', part.contentType)}`,
    ...extra,
  ];
}

function partText(boundary: string, part: MultipartPart): string {
  if (part.body.includes(`--${boundary}`)) {
    throw new MultipartBoundaryError(
      'a string that does not occur in any part body',
      `a body of the part ${part.name} that contains it`,
    );
  }
  return `--${boundary}\r\n${headLines(part).join('\r\n')}\r\n\r\n${part.body}\r\n`;
}

export function multipartMixed(boundary: string, parts: readonly MultipartPart[]): MultipartBody {
  if (!BOUNDARY.test(boundary)) {
    throw new MultipartBoundaryError('1 to 70 characters of an RFC 2046 boundary', boundary);
  }
  const text = `${parts.map((part) => partText(boundary, part)).join('')}--${boundary}--\r\n`;
  return {
    contentType: `multipart/mixed; boundary=${boundary}`,
    bytes: Buffer.from(text, 'utf8'),
  };
}
