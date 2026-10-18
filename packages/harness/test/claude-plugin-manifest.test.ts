import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadPlugin, parseMarkdownFile } from '../src/composition/claude-plugin-manifest';
import { Config } from '@deepseek-ai/dsh-mcp-client';
import { mapMcpServer } from '../src/composition/claude-plugin-mcp';

let root: string | undefined;
afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  root = undefined;
});

async function plugin(files: Readonly<Record<string, string>>): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'plugin-manifest-'));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

const MANIFEST = JSON.stringify({
  name: 'demo',
  description: 'A demo plugin.',
  version: '1.2.3',
  author: { name: 'Someone', email: 'someone@example.com' },
  keywords: 'a, b',
  repository: { type: 'git', url: 'https://example.com/demo.git' },
});

describe('loading a Claude plugin folder', () => {
  it('reads the manifest, commands, agents, hooks file and MCP servers', async () => {
    const folder = await plugin({
      '.claude-plugin/plugin.json': MANIFEST,
      'commands/review.md':
        '---\nargument-hint: file\n---\n\nReview the file.\n\nSecond paragraph.\n',
      'commands/ship.md': '---\ndescription: Ship it\n---\n\nShip.\n',
      'agents/helper.md': '---\nname: helper\nmodel: sonnet\n---\n\nHelp out.\n',
      'hooks/hooks.json': '{}',
      '.mcp.json': JSON.stringify({ mcpServers: { files: { command: 'node', args: ['x.js'] } } }),
    });

    const loaded = await loadPlugin(folder);

    expect(loaded.metadata).toStrictEqual({ name: 'demo', description: 'A demo plugin.' });
    expect(loaded.components.commands).toStrictEqual([
      expect.objectContaining({
        name: 'review',
        description: 'Review the file.',
        argumentHint: 'file',
      }),
      expect.objectContaining({ name: 'ship', description: 'Ship it' }),
    ]);
    expect(loaded.components.agents).toStrictEqual([
      expect.objectContaining({ name: 'helper', model: 'sonnet', body: 'Help out.' }),
    ]);
    expect(loaded.components.hooksFile).toBe(join(folder, 'hooks', 'hooks.json'));
    expect(Object.keys(loaded.components.mcpServers)).toStrictEqual(['files']);
  });

  it('loads a plugin with a bare manifest and no components', async () => {
    const folder = await plugin({ '.claude-plugin/plugin.json': '{"name":"bare"}' });

    const loaded = await loadPlugin(folder);

    expect(loaded.components).toStrictEqual({ commands: [], agents: [], mcpServers: {} });
  });

  it('names the manifest file when it has no plugin name', async () => {
    const folder = await plugin({ '.claude-plugin/plugin.json': '{"description":"x"}' });

    await expect(loadPlugin(folder)).rejects.toThrow(/plugin\.json.*name/su);
  });

  it('skips a command or agent file that cannot be used and keeps the rest of the plugin', async () => {
    const folder = await plugin({
      '.claude-plugin/plugin.json': '{"name":"demo"}',
      'commands/empty.md': '---\ndescription: x\n---\n',
      'commands/good.md': 'Do it',
      'agents/Bad_Name.md': 'Persona',
    });

    const loaded = await loadPlugin(folder);

    expect(loaded.components.commands.map((command) => command.name)).toStrictEqual(['good']);
    expect(loaded.components.agents).toStrictEqual([]);
  });
});

describe('parsing a Markdown file with frontmatter', () => {
  it('keeps unknown keys out of the way and returns the body without the header', () => {
    const parsed = parseMarkdownFile(
      '---\nname: x\nallowed-tools: Read\nhooks:\n  Stop: []\n---\n\nBody\n',
    );

    expect(parsed.frontmatter.name).toBe('x');
    expect(parsed.body).toBe('Body\n');
  });

  it('treats a file without a closing marker as plain body', () => {
    const text = '---\nname: x\nBody\n';

    expect(parseMarkdownFile(text)).toStrictEqual({ frontmatter: {}, body: text });
  });
});

describe('tolerant frontmatter like Claude Code reads it', () => {
  it('keeps a bracketed argument-hint as written', async () => {
    const folder = await plugin({
      '.claude-plugin/plugin.json': '{"name":"demo"}',
      'commands/one.md': '---\nargument-hint: [project-name]\n---\n\nDo it.\n',
      'commands/two.md':
        '---\ndescription: Two\nargument-hint: [system] [--source <path>]\n---\n\nDo it.\n',
    });

    const loaded = await loadPlugin(folder);

    expect(loaded.components.commands).toStrictEqual([
      expect.objectContaining({ name: 'one', argumentHint: '[project-name]' }),
      expect.objectContaining({
        name: 'two',
        description: 'Two',
        argumentHint: '[system] [--source <path>]',
      }),
    ]);
  });

  it('reads an agent description that holds an unquoted colon', async () => {
    const folder = await plugin({
      '.claude-plugin/plugin.json': '{"name":"demo"}',
      'agents/reviewer.md':
        '---\nname: reviewer\ndescription: Use this agent when needed: for reviews\nmodel: opus\n---\n\nReview.\n',
    });

    const loaded = await loadPlugin(folder);

    expect(loaded.components.agents).toStrictEqual([
      expect.objectContaining({
        name: 'reviewer',
        description: 'Use this agent when needed: for reviews',
        model: 'opus',
      }),
    ]);
  });

  it('reads frontmatter after a leading byte order mark', () => {
    const parsed = parseMarkdownFile('\uFEFF---\nname: x\n---\n\nBody\n');

    expect(parsed).toStrictEqual({ frontmatter: { name: 'x' }, body: 'Body\n' });
  });

  it('keeps folded multi-line descriptions', () => {
    const parsed = parseMarkdownFile('---\ndescription: >\n  one\n  two\n---\nBody\n');

    expect(parsed.frontmatter.description).toBe('one two\n');
  });
});

describe('loading a plugin whose .mcp.json has unusable servers', () => {
  it('keeps the plugin and its usable servers and leaves out placeholders, sse and unknown types', async () => {
    const folder = await plugin({
      '.claude-plugin/plugin.json': MANIFEST,
      'commands/ship.md': '---\ndescription: Ship it\n---\n\nShip.\n',
      'skills/one/SKILL.md': '---\nname: one\ndescription: One.\n---\n\nBody.\n',
      '.mcp.json': JSON.stringify({
        mcpServers: {
          gmail: { type: 'http', url: '' },
          slack: { type: 'http', url: 'https://slack.test/mcp', oauth: { clientId: 'x' } },
          stream: { type: 'sse', url: 'https://sse.test' },
          odd: { type: 'websocket', url: 'wss://x.test' },
          blank: { command: '' },
          files: { command: 'node', args: ['x.js'] },
        },
      }),
    });

    const loaded = await loadPlugin(folder);

    expect(loaded.components.commands).toHaveLength(1);
    expect(Object.keys(loaded.components.mcpServers).sort()).toStrictEqual(['files', 'slack']);
  });
});

describe('mapping a plugin MCP server', () => {
  const source = {
    pluginName: 'My Plugin',
    pluginRoot: '/plugins/my',
    serverKey: 'files',
    toolCallTimeoutMs: 1000,
  };

  it('maps a stdio server with the plugin root substituted', () => {
    expect(
      mapMcpServer(
        { command: '${CLAUDE_PLUGIN_ROOT}/bin/serve', args: ['--root', '${CLAUDE_PLUGIN_ROOT}'] },
        source,
      ),
    ).toStrictEqual({
      transport: 'stdio',
      serverName: 'my-plugin-files',
      command: '/plugins/my/bin/serve',
      args: ['--root', '/plugins/my'],
      env: {},
      cwd: '',
      toolCallTimeoutMs: 1000,
    });
  });

  it('maps an http server with its headers', () => {
    expect(
      mapMcpServer({ type: 'http', url: 'https://x.test/mcp', headers: { a: 'b' } }, source),
    ).toMatchObject({
      transport: 'streamable-http',
      url: 'https://x.test/mcp',
      headers: { a: 'b' },
    });
  });

  it('lets a server that cannot connect stay unavailable instead of failing the session', () => {
    const stdio = mapMcpServer({ command: 'node' }, source);
    const http = mapMcpServer({ type: 'http', url: 'http://127.0.0.1:1/mcp' }, source);

    expect(Config(stdio).failOnStartupError).toBe(false);
    expect(Config(http).failOnStartupError).toBe(false);
  });
});
