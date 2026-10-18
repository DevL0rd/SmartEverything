import { describe, expect, it } from 'vitest';
import { expectedBone, fatScale, muscleScale, normalBmr, normalWater } from '../src/body-scales';

describe('fat scale', () => {
  it('moves up with age for an adult woman', () => {
    expect(fatScale('female', 30)).toEqual([21, 28, 35, 40]);
    expect(fatScale('female', 50)).toEqual([22, 29, 36, 41]);
    expect(fatScale('female', 70)).toEqual([23, 30, 37, 42]);
  });

  it('uses the child tables for a girl and the one child table for a boy', () => {
    expect(fatScale('female', 10)).toEqual([12, 21, 30, 34]);
    expect(fatScale('female', 13)).toEqual([15, 24, 33, 37]);
    expect(fatScale('female', 15)).toEqual([18, 27, 36, 40]);
    expect(fatScale('female', 17)).toEqual([20, 28, 37, 41]);
    expect(fatScale('male', 10)).toEqual([7, 16, 25, 30]);
    expect(fatScale('male', 17)).toEqual([7, 16, 25, 30]);
  });

  it('switches table on the birthday, not the day before', () => {
    expect(fatScale('male', 17.99)).toEqual([7, 16, 25, 30]);
    expect(fatScale('male', 18)).toEqual([11, 17, 22, 27]);
    expect(fatScale('male', 39.99)).toEqual([11, 17, 22, 27]);
    expect(fatScale('male', 40)).toEqual([12, 18, 23, 28]);
  });

  it('keeps using the oldest table beyond the last age', () => {
    expect(fatScale('male', 200)).toEqual([14, 20, 25, 30]);
    expect(fatScale('female', 250)).toEqual([23, 30, 37, 42]);
  });
});

describe('muscle scale', () => {
  it('picks the row by height, each sex with its own limits', () => {
    expect(muscleScale('male', 175)).toEqual([49.4, 59.5]);
    expect(muscleScale('male', 165)).toEqual([44, 52.5]);
    expect(muscleScale('male', 150)).toEqual([38.5, 46.6]);
    expect(muscleScale('female', 165)).toEqual([36.5, 42.6]);
    expect(muscleScale('female', 155)).toEqual([32.9, 37.6]);
    expect(muscleScale('female', 140)).toEqual([29.1, 34.8]);
  });

  it('starts a row exactly at its height', () => {
    expect(muscleScale('male', 170)).toEqual([49.4, 59.5]);
    expect(muscleScale('male', 169.9)).toEqual([44, 52.5]);
    expect(muscleScale('female', 160)).toEqual([36.5, 42.6]);
  });

  it('refuses a height below zero', () => {
    expect(() => muscleScale('male', -1)).toThrow(RangeError);
  });
});

describe('reference values', () => {
  it('expects more bone in a heavier person', () => {
    expect(expectedBone('male', 80)).toBe(2);
    expect(expectedBone('male', 65)).toBe(1.9);
    expect(expectedBone('male', 50)).toBe(1.6);
    expect(expectedBone('female', 65)).toBe(1.8);
    expect(expectedBone('female', 50)).toBe(1.5);
    expect(expectedBone('female', 40)).toBe(1.3);
  });

  it('expects more water in a man', () => {
    expect(normalWater('male')).toBe(55);
    expect(normalWater('female')).toBe(45);
  });

  it('expects a metabolic rate per kilo that falls with age', () => {
    expect(normalBmr('male', 25, 80)).toBeCloseTo(80 * 21.6);
    expect(normalBmr('male', 40, 80)).toBeCloseTo(80 * 20.07);
    expect(normalBmr('male', 70, 80)).toBeCloseTo(80 * 19.35);
    expect(normalBmr('female', 25, 60)).toBeCloseTo(60 * 21.24);
    expect(normalBmr('female', 40, 60)).toBeCloseTo(60 * 19.53);
    expect(normalBmr('female', 70, 60)).toBeCloseTo(60 * 18.63);
  });

  it('refuses an age beyond the table', () => {
    expect(() => normalBmr('male', 200, 80)).toThrow(RangeError);
  });
});
