import { RuleTester, localRule } from './lint-rule-tester';

const OPTIONS = { languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } } as const;

const eager = [{ messageId: 'eager' }];

new RuleTester(OPTIONS).run('lazy-debug-payload', await localRule('lazy-debug-payload'), {
  valid: [
    { code: 'log.debug("a.b");' },
    { code: 'log.debug("a.b", { id, count: rows.length, ok: !failed, at: state?.at ?? null });' },
    { code: 'log.trace("a.b", { elapsed: end - start, reason: String(error) });' },
    { code: 'log.debug("a.b", { ms: Math.round(ms) });' },
    { code: 'log.debug("a.b", facts);' },
    { code: 'log.debug(`${event}.started`, facts);' },
    { code: 'log.debug("a.b", () => ({ ...facts, keys: Object.keys(args).length }));' },
    { code: 'log.debug("a.b", function payload() { return { rows: rows.map(String) }; });' },
    { code: 'log.info("a.b", { ...facts, keys: Object.keys(args).length });' },
    { code: 'log.debug(name, { ...facts });' },
    { code: 'debug("a.b", { ...facts });' },
  ],
  invalid: [
    {
      code: 'log.debug("a.b", { ...facts, ok });',
      output: 'log.debug("a.b", () => ({ ...facts, ok }));',
      errors: eager,
    },
    {
      code: 'this.log.trace("a.b", { keys: Object.keys(args).length });',
      output: 'this.log.trace("a.b", () => ({ keys: Object.keys(args).length }));',
      errors: eager,
    },
    {
      code: 'log.debug("a.b", { ms: Date.now() - startedAt });',
      output: 'log.debug("a.b", () => ({ ms: Date.now() - startedAt }));',
      errors: eager,
    },
    {
      code: 'log.debug("a.b", { kinds: `${a}:${b}` });',
      output: 'log.debug("a.b", () => ({ kinds: `${a}:${b}` }));',
      errors: eager,
    },
    {
      code: 'log.debug("a.b", fieldsOf(event));',
      output: 'log.debug("a.b", () => fieldsOf(event));',
      errors: eager,
    },
    {
      code: 'log.debug("a.b", { list: [a, b] });',
      output: 'log.debug("a.b", () => ({ list: [a, b] }));',
      errors: eager,
    },
    {
      code: 'log.debug("a.b", { [keyOf(a)]: 1 });',
      output: 'log.debug("a.b", () => ({ [keyOf(a)]: 1 }));',
      errors: eager,
    },
    {
      code: 'async function f() { log.debug("a.b", { value: await read() }); }',
      output: null,
      errors: eager,
    },
  ],
});
