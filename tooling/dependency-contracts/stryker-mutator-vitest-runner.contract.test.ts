import { describe } from 'vitest';
import { itIsPinnedToItsDeclaredVersion, itMatchesTheVersionOf } from './contract-helpers';

describe('@stryker-mutator/vitest-runner contract', () => {
  itIsPinnedToItsDeclaredVersion('@stryker-mutator/vitest-runner');
  itMatchesTheVersionOf('@stryker-mutator/vitest-runner', '@stryker-mutator/core');
});
