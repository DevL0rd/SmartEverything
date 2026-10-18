import { describe, expect, it } from 'vitest';
import { blankForm, checkForm, nutrientProblemKey } from './food-form';

function filled(): ReturnType<typeof blankForm> {
  return { ...blankForm('Oats', ''), kcal: '380' };
}

describe('checkForm', () => {
  it('accepts a food with only the calories filled in', () => {
    expect(checkForm(filled(), 'custom').ok).toBe(true);
  });

  it('marks only the nutrient that is wrong', () => {
    const result = checkForm(
      { ...filled(), nutrients: { protein: 'lots', totalFat: '6', sugar: '1' } },
      'custom',
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect([...result.problems.keys()]).toEqual([nutrientProblemKey('protein')]);
    expect(result.problems.get('grams.protein')).toBe('Use numbers only');
  });

  it('marks each wrong nutrient on its own', () => {
    const result = checkForm(
      { ...filled(), nutrients: { protein: 'x', sodium: 'y', caffeine: '3' } },
      'custom',
    );
    if (result.ok) {
      throw new Error('the form should have been refused');
    }
    expect([...result.problems.keys()].sort()).toEqual(['grams.protein', 'grams.sodium']);
  });

  it('still keys other problems by their field', () => {
    const result = checkForm({ ...blankForm('', ''), kcal: '' }, 'custom');
    if (result.ok) {
      throw new Error('the form should have been refused');
    }
    expect(result.problems.get('name')).toBe('Give it a name');
    expect(result.problems.get('kcal')).toBe('Enter the calories');
  });
});
