import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { shownTarget, writeShownQueries } from './shown-query';

const LIST = z.array(z.strictObject({ id: z.string(), on: z.boolean() }));

function clientWith(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(['tools', 'a'], [{ id: 't1', on: false }]);
  client.setQueryData(['tools', 'b'], [{ id: 't2', on: false }]);
  client.setQueryData(['tools', 'odd'], 'not a list');
  return client;
}

const switchOn = shownTarget(['tools'], LIST, (tools) =>
  tools.map((tool) => (tool.id === 't1' ? { ...tool, on: true } : tool)),
);

describe('writeShownQueries', () => {
  it('shows the change in every matching query before the Hub answers', async () => {
    const client = clientWith();
    const seen: unknown[] = [];
    await writeShownQueries(client, {
      event: 'plugin.tool_switch',
      targets: [switchOn],
      send: () => {
        seen.push(client.getQueryData(['tools', 'a']));
        return Promise.resolve('ok');
      },
    });
    expect(seen).toEqual([[{ id: 't1', on: true }]]);
    expect(client.getQueryData(['tools', 'b'])).toEqual([{ id: 't2', on: false }]);
    expect(client.getQueryData(['tools', 'odd'])).toBe('not a list');
  });

  it('puts every query back and rethrows when the Hub refuses', async () => {
    const client = clientWith();
    const before = client.getQueryData(['tools', 'b']);
    await expect(
      writeShownQueries(client, {
        event: 'plugin.tool_switch',
        targets: [switchOn],
        send: () => Promise.reject(new Error('refused')),
      }),
    ).rejects.toThrow('refused');
    expect(client.getQueryData(['tools', 'a'])).toEqual([{ id: 't1', on: false }]);
    expect(client.getQueryData(['tools', 'b'])).toBe(before);
  });
});
