import { describe, expect, it } from 'vitest';
import { MCP_TOKEN, createMcpToken, hashMcpToken } from '../src';

describe('personal MCP tokens', () => {
  it('creates distinct tokens of the published shape', () => {
    const token = createMcpToken();
    expect(token).toMatch(/^mcp_[0-9a-f]{64}$/);
    expect(MCP_TOKEN.parse(token)).toBe(token);
    expect(createMcpToken()).not.toBe(token);
  });

  it('stores only the SHA-256 of the whole token', () => {
    expect(hashMcpToken(`mcp_${'ab'.repeat(32)}`)).toBe(
      '15fbde0a791048615d20b8718c39afa0f262789227c6277afd7de11573adb38c',
    );
  });

  it('refuses to hash anything that is not a token', () => {
    expect(() => hashMcpToken('mcp_short')).toThrow();
    expect(() => hashMcpToken(`hst_${'ab'.repeat(32)}`)).toThrow();
    expect(() => hashMcpToken(`mcp_${'ab'.repeat(32)}x`)).toThrow();
    expect(() => hashMcpToken(`xmcp_${'ab'.repeat(32)}`)).toThrow();
  });
});
