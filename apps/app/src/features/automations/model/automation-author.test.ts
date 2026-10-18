import { describe, expect, it } from 'vitest';
import { authorLine } from './automation-author';

const ALEX = '30000000-0000-4000-8000-0000000000a1';
const PEOPLE = [{ id: ALEX, name: 'Alex' }];

describe('who made an automation', () => {
  it('names the person who saved it', () => {
    expect(authorLine({ author: { via: 'person', profile_id: ALEX }, origin: null }, PEOPLE)).toBe(
      'Made by Alex.',
    );
  });

  it('says the AI made it and for whom', () => {
    expect(
      authorLine({ author: { via: 'assistant', profile_id: ALEX }, origin: null }, PEOPLE),
    ).toBe('Made by the AI for Alex.');
  });

  it('says so when it predates the record', () => {
    expect(authorLine({ author: null, origin: null }, PEOPLE)).toBe(
      'Made before the maker was recorded.',
    );
  });

  it('names a plugin that made it', () => {
    expect(
      authorLine({ author: null, origin: { plugin_id: 'aibi', requester: 'owner' } }, PEOPLE),
    ).toBe('Made through the aibi plugin.');
  });

  it('does not invent a name for a removed person', () => {
    expect(
      authorLine({ author: { via: 'person', profile_id: 'gone' }, origin: null }, PEOPLE),
    ).toBe('Made by someone who was removed.');
  });
});
