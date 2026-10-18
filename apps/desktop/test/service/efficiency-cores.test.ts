import { describe, expect, it } from 'vitest';
import { efficiencyCores } from '../../src/service/efficiency-cores.js';

function missing(): string {
  throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
}

describe('efficiencyCores', () => {
  it('reads the atom core list of a hybrid Linux CPU', () => {
    expect(efficiencyCores('linux', () => '16-31\n')).toBe('16-31');
  });

  it('finds none on a CPU without hybrid cores or an empty list', () => {
    expect(efficiencyCores('linux', missing)).toBeNull();
    expect(efficiencyCores('linux', () => '\n')).toBeNull();
  });

  it('does not pin on other platforms', () => {
    expect(efficiencyCores('win32', () => '16-31')).toBeNull();
    expect(efficiencyCores('darwin', () => '16-31')).toBeNull();
  });

  it('reports a read that fails for any other reason', () => {
    expect(() =>
      efficiencyCores('linux', () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      }),
    ).toThrow('denied');
  });
});
