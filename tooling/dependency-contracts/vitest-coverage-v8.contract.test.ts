import { describe } from 'vitest';
import { itMatchesTheVersionOf } from './contract-helpers';

describe('@vitest/coverage-v8 contract', () => {
  itMatchesTheVersionOf('@vitest/coverage-v8', 'vitest');
});
