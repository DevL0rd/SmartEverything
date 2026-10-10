import type { FetchLike } from '../../src/plugins/builtin/fetch-like';

interface RecordedCall {
  readonly method: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly body: unknown;
}

type Route = (call: RecordedCall) => unknown;

export function fakeHttp(routes: Readonly<Record<string, Route | object | null>>): {
  readonly fetcher: FetchLike;
  readonly calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetcher: FetchLike = (input, init) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const raw = init.body;
    const call: RecordedCall = {
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: typeof raw === 'string' ? JSON.parse(raw) : null,
    };
    calls.push(call);
    const route = routes[`${method} ${url.pathname}`];
    if (route === undefined) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    const value: unknown = typeof route === 'function' ? route(call) : route;
    return Promise.resolve(
      new Response(value === null ? '' : JSON.stringify(value), { status: 200 }),
    );
  };
  return { fetcher, calls };
}
