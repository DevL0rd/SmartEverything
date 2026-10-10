import { describe } from 'vitest';
import { itIsPinnedToItsDeclaredVersion, itMatchesTheVersionOf } from './contract-helpers';

describe('@vitest/coverage-v8 contract', () => {
  itIsPinnedToItsDeclaredVersion('@vitest/coverage-v8');
  itMatchesTheVersionOf('@vitest/coverage-v8', 'vitest');
});
