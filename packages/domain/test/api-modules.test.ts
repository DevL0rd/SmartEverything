import { describe, expect, it } from 'vitest';

const FIRST = '00000000-0000-4000-8000-000000000001';
const SECOND = '00000000-0000-4000-8000-000000000002';

describe('api modules', () => {
  it('the primitives module loads and builds comma-separated query lists', async () => {
    const { ID, queryList } = await import('../src/api/primitives');
    expect(queryList(ID).parse(`${FIRST},${SECOND}`)).toStrictEqual([FIRST, SECOND]);
  });

  it('the home rows module loads with trimmed, bounded names', async () => {
    const { HOME_NAME, DEVICE_NAME } = await import('../src/api/rows-home');
    expect(HOME_NAME.parse(' Home ')).toBe('Home');
    expect(DEVICE_NAME.parse('Lamp')).toBe('Lamp');
  });
});
