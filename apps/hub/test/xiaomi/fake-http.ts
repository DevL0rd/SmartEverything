export interface FakeRequest {
  readonly url: URL;
  readonly method: string;
  readonly cookies: ReadonlyMap<string, string>;
  readonly form: URLSearchParams;
}

export type Route = (request: FakeRequest) => Response | null;

function cookiesOf(headers: Headers): Map<string, string> {
  const header = headers.get('cookie') ?? '';
  return new Map(
    header
      .split(';')
      .map((pair) => pair.trim())
      .filter((pair) => pair.includes('='))
      .map((pair) => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]),
  );
}

function withCookies(init: Record<string, string>, setCookies: readonly string[]): Headers {
  const headers = new Headers(init);
  for (const cookie of setCookies) {
    headers.append('set-cookie', cookie);
  }
  return headers;
}

export function accountJson(value: unknown, setCookies: readonly string[] = []): Response {
  return new Response(`&&&START&&&${JSON.stringify(value)}`, {
    status: 200,
    headers: withCookies({ 'content-type': 'application/json' }, setCookies),
  });
}

export function redirect(location: string, setCookies: readonly string[] = []): Response {
  return new Response(null, { status: 302, headers: withCookies({ location }, setCookies) });
}

export function plain(status: number, body: string, setCookies: readonly string[] = []): Response {
  return new Response(body, { status, headers: withCookies({}, setCookies) });
}

export function requestOf(url: string, init: RequestInit): FakeRequest {
  const parsed = new URL(url);
  const body = typeof init.body === 'string' ? init.body : '';
  return {
    url: parsed,
    method: init.method ?? 'GET',
    cookies: cookiesOf(new Headers(init.headers)),
    form: new URLSearchParams(body === '' ? parsed.search : body),
  };
}
