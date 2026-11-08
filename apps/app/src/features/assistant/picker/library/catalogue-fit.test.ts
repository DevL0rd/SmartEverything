import { expect, it } from 'vitest';
import { catalogueHeight } from './catalogue-fit';

it('fits an empty or failed result to the measured content', () => {
  expect(catalogueHeight(560, 48, { tools: 106, results: 132 })).toBe(294);
});

it('fits a short list with its actions and bounds a large one', () => {
  const parts = { tools: 106, results: 88, listFooter: 44, selection: 64 };
  expect(catalogueHeight(560, 48, parts)).toBe(358);
  expect(catalogueHeight(560, 48, { ...parts, results: 880 })).toBe(560);
});
