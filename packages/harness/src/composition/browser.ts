import type { Context } from '@deepseek-ai/cordis';
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require';
import type * as BrowserUse from '@deepseek-ai/dsh-browser-use';
import type * as McpResources from '@deepseek-ai/dsh-mcp-resources';
import { mountSessionMcp } from '@deepseek-ai/dsh-experimental-browser-use-runtime/mcp';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { mountBrowserPermission } from './browser-permission';

const loadBrowserUse = createLazyRequire<typeof BrowserUse>(
  '@deepseek-ai/dsh-browser-use',
  import.meta.url,
);
const loadResources = createLazyRequire<typeof McpResources>(
  '@deepseek-ai/dsh-mcp-resources',
  import.meta.url,
);
const BROWSER_CONFIG = z.strictObject({
  browser: z.enum(['chrome', 'chromium', 'msedge', 'firefox', 'webkit']).default('chrome'),
  executable_path: z.string().min(1).refine(isAbsolute).optional(),
  tool_call_timeout_ms: z.int().min(1).default(60_000),
});

export async function mountHeadlessBrowser(
  ctx: Context,
  raw: unknown,
): Promise<{ readonly dispose: () => Promise<void> }> {
  const server = playwrightServer(raw);
  const fiber = ctx.inject(['tools', 'sandboxPolicy'], async (scope: Context): Promise<void> => {
    mountBrowserPermission(scope);
    await scope.plugin(loadBrowserUse().default);
    await scope.plugin(loadResources().default);
    await scope.plugin({
      name: 'harness-playwright-mcp',
      inject: ['browserUse', 'agents', 'tools', 'systemPrompt', 'workingDirectory'],
      apply: (inner: Context): void => {
        mountSessionMcp(inner, server);
      },
    });
  });
  try {
    await fiber;
    return { dispose: fiber.dispose };
  } catch (error) {
    await fiber.dispose();
    throw error;
  }
}

export function playwrightServer(raw: unknown): Parameters<typeof mountSessionMcp>[1] {
  const config = BROWSER_CONFIG.parse(raw);
  const cli = join(
    dirname(fileURLToPath(import.meta.resolve('@playwright/mcp/package.json'))),
    'cli.js',
  );
  return {
    name: 'playwright-mcp',
    exclusive: false,
    command: process.execPath,
    args: [
      cli,
      '--browser',
      config.browser,
      '--isolated',
      '--headless',
      ...(config.executable_path === undefined
        ? []
        : ['--executable-path', config.executable_path]),
    ],
    toolCallTimeoutMs: config.tool_call_timeout_ms,
  };
}
