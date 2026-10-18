import { describe, expect, it } from 'vitest';
import { NO_PARAMS, parseGroupPageParams, routeId } from './route-params';

describe('parseGroupPageParams', () => {
  it('reads the member, the editor request and the control to focus', () => {
    expect(parseGroupPageParams({ member: 'lamp', edit: '1', focus: 'brightness' })).toStrictEqual({
      member: 'lamp',
      edit: true,
      focus: 'brightness',
    });
  });

  it('takes the first value of a repeated parameter', () => {
    expect(parseGroupPageParams({ member: ['a', 'b'] }).member).toBe('a');
  });

  it('falls back to nothing requested when a value is not understood', () => {
    expect(parseGroupPageParams({ edit: 'yes' })).toStrictEqual(NO_PARAMS);
    expect(parseGroupPageParams({ member: '' })).toStrictEqual(NO_PARAMS);
    expect(parseGroupPageParams({})).toStrictEqual(NO_PARAMS);
    expect(parseGroupPageParams('member=x')).toStrictEqual(NO_PARAMS);
  });

  it('keeps every understood value when another one is not', () => {
    expect(parseGroupPageParams({ member: 'x', edit: 'yes', focus: '' })).toStrictEqual({
      member: 'x',
      edit: false,
      focus: null,
    });
    expect(parseGroupPageParams({ member: '', edit: '1', focus: 'brightness' })).toStrictEqual({
      member: null,
      edit: true,
      focus: 'brightness',
    });
  });
});

describe('routeId', () => {
  it('returns a non-empty id and nothing otherwise', () => {
    expect(routeId('g1')).toBe('g1');
    expect(routeId(['g1'])).toBe('g1');
    expect(routeId('')).toBeNull();
    expect(routeId(undefined)).toBeNull();
  });
});
