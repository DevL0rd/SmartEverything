import { describe, expect, it } from 'vitest';
import { rejectedTables } from './live-subscription';

describe('rejectedTables', () => {
  const sent = ['settings', 'rooms', 'devices', 'television_settings', 'device_state'];

  it('names the tables a hub says it does not know, by their place in the subscription', () => {
    expect(
      rejectedTables(
        sent,
        'The live message is not valid: tables.3: Invalid option: expected one of "settings"|"rooms"',
      ),
    ).toStrictEqual(['television_settings']);
  });

  it('names every rejected table once', () => {
    expect(
      rejectedTables(sent, 'tables.1: Invalid option; tables.3: Invalid option; tables.1: x'),
    ).toStrictEqual(['rooms', 'television_settings']);
  });

  it('names nothing for a refusal about something else', () => {
    expect(
      rejectedTables(sent, 'The live message is not valid: streams.0: Invalid option'),
    ).toStrictEqual([]);
    expect(rejectedTables(sent, 'tables.99: Invalid option')).toStrictEqual([]);
  });
});
