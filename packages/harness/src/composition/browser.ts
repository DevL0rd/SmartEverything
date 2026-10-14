import type { Context } from '@deepseek-ai/cordis';
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require';
import type * as BrowserUse from '@deepseek-ai/dsh-browser-use';
import type * as PlaywrightBrowser from '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp';
import type * as McpResources from '@deepseek-ai/dsh-mcp-resources';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { HarnessRuntimeError } from '../host/errors';
import { verifyBrowserPackages } from './browser-provenance';
import { browserPermissionDenial } from './browser-permission';

const loadBrowserUse = createLazyRequire<typeof BrowserUse>(
  '@deepseek-ai/dsh-browser-use',
  import.meta.url,
);
const loadPlaywrightBrowser = createLazyRequire<typeof PlaywrightBrowser>(
  '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp',
  import.meta.url,
);
const loadResources = createLazyRequire<typeof McpResources>(
  '@deepseek-ai/dsh-mcp-resources',
  import.meta.url,
);
const BROWSER_CONFIG = z.strictObject({
  executable_path: z.string().min(1).refine(isAbsolute).optional(),
  tool_call_timeout_ms: z.int().min(1).max(300_000).default(60_000),
});
const CHROMIUM_EXECUTABLES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/opt/google/chrome/chrome',
];

export async function mountHeadlessBrowser(
  ctx: Context,
  raw: unknown,
): Promise<{ readonly dispose: () => Promise<void> }> {
  const config = BROWSER_CONFIG.parse(raw);
  await verifyBrowserPackages();
  const executablePath = await chromiumExecutable(config.executable_path);
  const fiber = ctx.inject(['tools', 'sandboxPolicy'], async (scope: Context): Promise<void> => {
    scope.tools.guard((execution) => browserPermissionDenial(scope, execution));
    await scope.plugin(loadBrowserUse().default);
    await scope.plugin(loadResources().default);
    await scope.plugin(loadPlaywrightBrowser(), {
      mode: 'launch',
      headless: true,
      executablePath,
      toolCallTimeoutMs: config.tool_call_timeout_ms,
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

async function chromiumExecutable(configured: string | undefined): Promise<string> {
  const candidates = configured === undefined ? CHROMIUM_EXECUTABLES : [configured];
  for (const path of candidates) {
    try {
      if (!(await stat(path)).isFile()) continue;
      await access(path, constants.X_OK);
      return path;
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        ['ENOENT', 'ENOTDIR', 'EACCES'].includes(String(error.code))
      ))
        throw error;
    }
  }
  throw new HarnessRuntimeError(
    'runtime_unavailable',
    `Headless browser requires an installed executable Chromium browser; checked ${candidates.join(', ')}. Configure executable_path for an existing installation.`,
  );
}
