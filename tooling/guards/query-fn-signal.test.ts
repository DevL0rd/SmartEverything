import { RuleTester, localRule } from './lint-rule-tester';

new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }).run(
  'query-fn-signal',
  await localRule('query-fn-signal'),
  {
    valid: [
      { code: 'useQuery({ queryKey: k, queryFn: ({ signal }) => readRecords(types, signal) });' },
      {
        code: 'useInfiniteQuery({ queryKey: k, queryFn: ({ pageParam, signal }) => readPage(pageParam, signal) });',
      },
      { code: 'useQuery({ queryKey: k, queryFn: ({ signal: aborted }) => read(aborted) });' },
      {
        code: 'useQuery({ queryKey: k, queryFn: id === null ? skipToken : ({ signal }) => read(id, signal) });',
      },
      {
        code: 'function read({ signal }) { return fetch(url, { signal }); } useQuery({ queryFn: read });',
      },
      { code: 'useQuery({ queryKey: k, queryFn: skipToken });' },
    ],
    invalid: [
      {
        code: 'useQuery({ queryKey: k, queryFn: () => readDailyFigures(first, last, metrics) });',
        errors: [{ messageId: 'noSignal' }],
      },
      {
        code: 'useInfiniteQuery({ queryKey: k, queryFn: ({ pageParam }) => readPage(pageParam) });',
        errors: [{ messageId: 'noSignal' }],
      },
      {
        code: 'useQuery({ queryKey: k, queryFn: ({ signal }) => readRecords(types) });',
        errors: [{ messageId: 'unusedSignal' }],
      },
      {
        code: 'useQuery({ queryKey: k, queryFn: id === null ? skipToken : () => read(id) });',
        errors: [{ messageId: 'noSignal' }],
      },
      {
        code: 'function readAll() { return api().call(E.list, {}); } useQuery({ queryFn: readAll });',
        errors: [{ messageId: 'noSignal' }],
      },
      {
        code: 'const readAll = async () => api().call(E.list, {}); useQuery({ queryFn: readAll });',
        errors: [{ messageId: 'noSignal' }],
      },
    ],
  },
);
