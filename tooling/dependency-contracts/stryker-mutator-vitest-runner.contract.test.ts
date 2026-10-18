import { describe } from 'vitest';
import { itMatchesTheVersionOf } from './contract-helpers';

describe('@stryker-mutator/vitest-runner contract', () => {
  itMatchesTheVersionOf('@stryker-mutator/vitest-runner', '@stryker-mutator/core');
});
