import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS } from '../src/api/endpoints';
import { MCP_OPERATION_TOOLS, MCP_PART_NAMES } from '../src/mcp/names';
import { MCP_ROUTES, MCP_TOOLS, partsOf } from '../src/mcp/served';
import { MCP_PART_TEXTS, MCP_PATHS, MCP_SCOPE } from '../src/mcp-tools';

const PART_ACCESS = new Map(MCP_PART_TEXTS.map((text) => [text.name, text.access]));

describe('the published MCP tool catalogue', () => {
  const names = MCP_TOOLS.map((tool) => tool.name);

  it('serves each tool once, from a route made of known parts', () => {
    expect(new Set(names).size).toBe(names.length);
    const known = new Set<string>(MCP_PART_NAMES);
    for (const [name, route] of MCP_ROUTES) {
      for (const part of partsOf(route)) {
        expect(known.has(part), `${name} → ${part}`).toBe(true);
      }
    }
  });

  it('uses every part, so no tool is left unreachable', () => {
    const used = new Set([...MCP_ROUTES.values()].flatMap(partsOf));
    expect(MCP_PART_NAMES.filter((part) => !used.has(part))).toEqual([]);
  });

  it('marks a tool as a read exactly when every one of its parts reads', () => {
    for (const tool of MCP_TOOLS) {
      const route = MCP_ROUTES.get(tool.name);
      const parts = route === undefined ? [] : partsOf(route);
      if (parts.length > 0) {
        const reads = parts.every((part) => PART_ACCESS.get(part) === 'read');
        expect(tool.access, tool.name).toBe(reads ? 'read' : 'control');
      }
    }
  });

  it('marks operation parts by their method', () => {
    for (const [name, operation] of MCP_OPERATION_TOOLS) {
      expect(PART_ACCESS.get(name), name).toBe(
        API_ENDPOINTS[operation].method === 'GET' ? 'read' : 'control',
      );
    }
  });

  it('serves the AI costs as one read tool in the assistant area', () => {
    const usage = MCP_TOOLS.find((tool) => tool.name === 'read_usage');
    expect(usage?.access).toBe('read');
    expect(usage?.area).toBe('assistant');
    expect(MCP_ROUTES.get('read_usage')).toEqual({
      key: 'view',
      parts: { totals: 'usage_totals', series: 'usage_series', ledger: 'usage_ledger' },
    });
  });

  it('keeps plugin messages in the assistant area and plugin tools in the plugins area', () => {
    const area = new Map(MCP_TOOLS.map((tool) => [tool.name, tool.area]));
    expect(area.get('ai_inbox_post')).toBe('assistant');
    expect(area.get('read_plugins')).toBe('plugins');
    expect(area.get('update_plugin')).toBe('plugins');
    expect(area.get('call_plugin_tool')).toBe('plugins');
  });

  it('gives every tool a title and a sentence describing it', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.title.length, tool.name).toBeGreaterThan(3);
      expect(tool.description, tool.name).toMatch(/^[A-Z].{8,}\.$/s);
    }
  });
});

describe('the MCP and OAuth paths', () => {
  it('serves the protocol, both metadata documents and every OAuth endpoint at fixed paths', () => {
    expect(MCP_PATHS).toStrictEqual({
      mcp: '/mcp',
      resourceMetadata: '/.well-known/oauth-protected-resource',
      mcpResourceMetadata: '/.well-known/oauth-protected-resource/mcp',
      serverMetadata: '/.well-known/oauth-authorization-server',
      register: '/oauth/register',
      authorize: '/oauth/authorize',
      token: '/oauth/token',
      revoke: '/oauth/revoke',
    });
    expect(MCP_SCOPE).toBe('mcp');
  });
});
