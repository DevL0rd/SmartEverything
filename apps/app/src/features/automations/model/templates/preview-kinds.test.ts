import { describe, expect, it } from 'vitest';
import { kindLookupOf } from '../../data/kind-lookup';
import { PREVIEW_LINT, previewLintOf } from '../fixtures/lint-context';
import { PING_KIND_ID, kindRow } from '../../../../test-support/plugin-kinds';

describe('the preview lint context', () => {
  it('lints with the kinds of the lookup it is given', () => {
    const lookup = kindLookupOf([kindRow()]);
    expect(previewLintOf(lookup).kinds(PING_KIND_ID)?.name).toBe('Ping the demo');
    expect(PREVIEW_LINT.kinds(PING_KIND_ID)).toBeUndefined();
  });
});
