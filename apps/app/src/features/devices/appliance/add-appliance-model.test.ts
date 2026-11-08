import { describe, expect, it } from 'vitest';
import type { IrLibraryModel } from '@smarteverything/domain';
import {
  categoryIcon,
  countLabel,
  defaultName,
  matching,
  modelSubtitle,
  modelTitle,
  modelWords,
  nameProblem,
  opensAfterCreate,
} from './add-appliance-model';

const CLIMATE: IrLibraryModel = {
  id: 'smartir:1120',
  source: 'smartir',
  kind: 'climate',
  category: 'Air conditioner',
  brand: 'Sharp',
  models: ['ARC433A46', 'ARC433B47'],
  buttons: [],
};

const KEYS: IrLibraryModel = {
  id: 'flipper:tv/samsung/1',
  source: 'flipper-irdb',
  kind: 'keys',
  category: 'TV',
  brand: 'Samsung',
  models: ['BN59'],
  buttons: ['Power', 'Vol up'],
};

describe('the add appliance browse', () => {
  it('filters by any word, ignoring case and spaces around the query', () => {
    expect(matching([CLIMATE, KEYS], '  arc433b ', modelWords)).toEqual([CLIMATE]);
    expect(matching([CLIMATE, KEYS], 'vol', modelWords)).toEqual([KEYS]);
    expect(matching([CLIMATE, KEYS], '', modelWords)).toEqual([CLIMATE, KEYS]);
  });

  it('shows every model a library entry covers and what it can do', () => {
    expect(modelTitle(CLIMATE)).toBe('ARC433A46, ARC433B47');
    expect(modelSubtitle(CLIMATE)).toBe('Full control: power, mode, temperature and fan in one go');
    expect(modelSubtitle(KEYS)).toBe('2 buttons');
    expect(countLabel(1)).toBe('1 model');
    expect(countLabel(12)).toBe('12 models');
  });

  it('opens the device page only for an air conditioner', () => {
    expect(opensAfterCreate('Air conditioner')).toBe(true);
    expect(opensAfterCreate('TV')).toBe(false);
    expect(categoryIcon('Air conditioner')).toBe('snowflake');
    expect(categoryIcon('Doorbells')).toBe('remote');
    expect(categoryIcon('Heater')).toBe('heater');
    expect(categoryIcon('TV')).toBe('tv');
  });

  it('suggests a name and refuses an empty or too long one', () => {
    expect(defaultName('Sharp', 'Air conditioner')).toBe('Sharp air conditioner');
    expect(defaultName('Sony', 'DVD player')).toBe('Sony DVD player');
    expect(nameProblem('  ')).toBe('Give it a name');
    expect(nameProblem('x'.repeat(81))).toBe('Use at most 80 characters');
    expect(nameProblem('Bedroom AC')).toBeNull();
  });
});
