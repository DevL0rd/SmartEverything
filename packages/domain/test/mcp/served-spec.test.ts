import { describe, expect, it } from 'vitest';
import { MCP_OPERATION_TOOLS, MCP_PART_NAMES } from '../../src/mcp/names';
import { MCP_ROUTES, MCP_TOOLS, partsOf } from '../../src/mcp/served';
import type { McpRoute } from '../../src/mcp/served-types';
import { MCP_PATHS, MCP_SCOPE } from '../../src/mcp-tools';
import { looksLikeMcpTool } from '../../src/mcp/scheme';

const NAME_LIMIT = 32;
const DESCRIPTION_MIN = 60;
const DESCRIPTION_MAX = 600;
const LINE_MAX = 60;
const BRANCH_LINE_MAX = 140;
const ACTIONS_MAX = 8;
const VIEWS_MAX = 12;

const NAMES: ReadonlySet<string> = new Set(MCP_TOOLS.map((tool) => tool.name));

function branchesOf(route: McpRoute): readonly (readonly [string, string])[] {
  return 'branches' in route
    ? Object.entries(route.branches).map(([value, branch]) => [value, branch.line] as const)
    : [];
}

describe('the served tool names', () => {
  it('are unique, short and follow domain_verb with known domains and verbs', () => {
    expect(NAMES.size).toBe(MCP_TOOLS.length);
    for (const { name } of MCP_TOOLS) {
      expect(name, name).toMatch(/^[a-z]+(_[a-z]+)+$/u);
      expect(name.length, name).toBeLessThanOrEqual(NAME_LIMIT);
      expect(looksLikeMcpTool(name), `${name} is not <domain>_<verb>`).toBe(true);
    }
  });
});

describe('the served tool texts', () => {
  it('describe each tool in whole sentences of bounded length', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.title.length, tool.name).toBeGreaterThan(3);
      expect(tool.description, tool.name).toMatch(/^[A-Z`].*\.$/su);
      expect(tool.description.length, tool.name).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
      expect(tool.description.length, tool.name).toBeLessThanOrEqual(DESCRIPTION_MAX);
    }
  });

  it('give every tool a short whole line', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.line.length, tool.name).toBeGreaterThan(0);
      expect(tool.line.length, tool.name).toBeLessThanOrEqual(LINE_MAX);
      expect(tool.line, tool.name).not.toMatch(/…|\.\.\.|[;:(]/u);
    }
  });

  it('name only tools that exist and never themselves', () => {
    for (const tool of MCP_TOOLS) {
      const words = tool.description.match(/[a-z]+(?:_[a-z]+)+/gu) ?? [];
      for (const word of words.filter((word) => looksLikeMcpTool(word))) {
        expect(NAMES.has(word), `${tool.name} names ${word}`).toBe(true);
        expect(word, `${tool.name} names itself`).not.toBe(tool.name);
      }
    }
  });
});

describe('the served routes', () => {
  it('keep reads read only and writes out of views', () => {
    for (const tool of MCP_TOOLS) {
      const route = MCP_ROUTES.get(tool.name);
      if (route !== undefined && 'key' in route) {
        expect(route.key, tool.name).toBe(tool.access === 'read' ? 'view' : 'action');
      }
    }
  });

  it('keep action and view sets small, each with a line', () => {
    for (const [name, route] of MCP_ROUTES) {
      const branches = branchesOf(route);
      const limit = 'key' in route && route.key === 'view' ? VIEWS_MAX : ACTIONS_MAX;
      expect(branches.length, name).toBeLessThanOrEqual(limit);
      for (const [value, line] of branches) {
        expect(value, name).toMatch(/^[a-z]+(_[a-z]+)*$/u);
        expect(line.length, `${name} ${value}`).toBeGreaterThan(0);
        expect(line.length, `${name} ${value}`).toBeLessThanOrEqual(BRANCH_LINE_MAX);
      }
    }
  });

  it('route each part from one tool at most, and only known parts', () => {
    const known: ReadonlySet<string> = new Set(MCP_PART_NAMES);
    const served = [...MCP_ROUTES.values()].flatMap(partsOf);
    for (const part of served) {
      expect(known.has(part), part).toBe(true);
    }
    const composed = [...MCP_ROUTES.values()].flatMap((route) =>
      'compose' in route ? route.compose : [],
    );
    const single = served.filter((part) => !composed.includes(part));
    expect(single.length).toBe(new Set(single).size);
  });

  it('serve every core part, leaving only operation parts to operation_call', () => {
    const used = new Set([...MCP_ROUTES.values()].flatMap(partsOf));
    const operationParts = new Set<string>(MCP_OPERATION_TOOLS.map(([name]) => name));
    expect(MCP_PART_NAMES.filter((part) => !used.has(part) && !operationParts.has(part))).toEqual(
      [],
    );
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
