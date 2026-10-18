import { describe, expect, it } from 'vitest';
import { playwrightServer } from '../src/composition/browser';

describe('the headless browser launch', () => {
  it('asks the Playwright MCP server for system Chrome, headless and isolated, by default', () => {
    const server = playwrightServer({});

    expect(server.args.slice(1)).toStrictEqual(['--browser', 'chrome', '--isolated', '--headless']);
    expect(server.args[0]).toMatch(/playwright[\\/]+mcp[\\/]+cli\.js$/u);
    expect(server.toolCallTimeoutMs).toBe(60_000);
  });

  it('passes a chosen browser and executable straight to the server', () => {
    const server = playwrightServer({
      browser: 'msedge',
      executable_path: '/opt/browsers/edge',
      tool_call_timeout_ms: 600_000,
    });

    expect(server.args).toStrictEqual(
      expect.arrayContaining(['--browser', 'msedge', '--executable-path', '/opt/browsers/edge']),
    );
    expect(server.toolCallTimeoutMs).toBe(600_000);
  });

  it('rejects an unknown browser and a relative executable path', () => {
    expect(() => playwrightServer({ browser: 'netscape' })).toThrow();
    expect(() => playwrightServer({ executable_path: 'chrome' })).toThrow();
  });
});
