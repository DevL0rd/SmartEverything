import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RuleTester, localRule } from './lint-rule-tester';
import { filesUnder, repositoryRoot } from './repository-files';

const OPTIONS = { languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } } as const;

new RuleTester(OPTIONS).run('no-swallowed-errors', await localRule('no-swallowed-errors'), {
  valid: [
    { code: 'try { run(); } catch (error) { log.warn("run.failed", { error }); }' },
    { code: 'try { run(); } catch (error) { log.error("run.failed", error); }' },
    { code: 'try { run(); } catch (error) { this.log.exception("run.failed", error); }' },
    { code: 'try { run(); } catch { throw new Error("run failed"); }' },
    { code: 'try { run(); } catch (error) { throw error; }' },
    { code: 'function f() { try { run(); } catch (error) { return { ok: false, error }; } }' },
    { code: 'try { run(); } catch (error) { reportFailure("Run", error); }' },
    { code: 'run().catch((error) => { log.warn("run.failed", { error }); });' },
    { code: 'run().catch((error) => { throw wrap(error); });' },
    { code: 'run().catch(() => { throw new Error("run failed"); });' },
    { code: 'run().catch(report);' },
    { code: 'run().then(ok, fail);' },
  ],
  invalid: [
    {
      code: 'function f() { try { run(); } catch (error) { return null; } }',
      errors: [{ messageId: 'catchSwallowed' }],
    },
    { code: 'try { run(); } catch { }', errors: [{ messageId: 'catchSwallowed' }] },
    {
      code: 'try { run(); } catch (error) { console.log("x"); }',
      errors: [{ messageId: 'catchSwallowed' }],
    },
    {
      code: 'for (;;) { try { run(); } catch (error) { fallback = 1; continue; } }',
      errors: [{ messageId: 'catchSwallowed' }],
    },
    { code: 'run().catch(() => undefined);', errors: [{ messageId: 'handlerSwallowed' }] },
    { code: 'run().catch(() => null);', errors: [{ messageId: 'handlerSwallowed' }] },
    { code: 'run().catch(() => ({}));', errors: [{ messageId: 'handlerSwallowed' }] },
    { code: 'run().catch((error) => []);', errors: [{ messageId: 'handlerSwallowed' }] },
    { code: 'run().catch(function () {});', errors: [{ messageId: 'handlerSwallowed' }] },
    { code: 'run().catch(noop);', errors: [{ messageId: 'noopHandler' }] },
    {
      code: 'void run().catch(() => undefined);',
      errors: [{ messageId: 'handlerSwallowed' }],
    },
  ],
});

const DIRECTIVE = /eslint-disable(?:-next-line)? local\/no-swallowed-errors[^\n]*/g;
const BUDGET = 40;

function sources(): readonly string[] {
  return ['apps', 'packages', 'tooling']
    .flatMap((root) => filesUnder(`${repositoryRoot}/${root}`))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !/node_modules|\/dist|\/coverage|\.test\./.test(file));
}

describe('swallowed errors stay rare', () => {
  it('keeps the count of allowed silent catches within its budget', () => {
    const allowed = sources().flatMap((file) => {
      const found = readFileSync(file, 'utf8').match(DIRECTIVE);
      return found === null ? [] : found.map(() => relative(repositoryRoot, file));
    });
    expect(allowed.length).toBeLessThanOrEqual(BUDGET);
  });

  it('gives every allowed silent catch a written reason', () => {
    const bare = sources().flatMap((file) =>
      (readFileSync(file, 'utf8').match(DIRECTIVE) ?? [])
        .filter((directive) => !/-- \S/.test(directive))
        .map(() => relative(repositoryRoot, file)),
    );
    expect(bare).toEqual([]);
  });
});
