export const BROWSER_PACKAGES = [
  {
    package: '@deepseek-ai/dsh-browser-use',
    version: '0.2.1-alpha.2',
    files: [
      'LICENSE',
      'lib/index.js',
      'lib/types/brand.js',
      'lib/types/index.d.ts',
      'package.json',
    ],
    sha256: '35756d003292d5bddc4281eb127768d508d07c5d912621c6e19e60f57de3a5a7',
  },
  {
    package: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp',
    version: '0.2.1-alpha.2',
    files: ['LICENSE', 'lib/index.js', 'lib/types/index.d.ts', 'package.json'],
    sha256: 'f9e0e79ff076b2b2443e780631005a087f47993cb527fa58dc65d0f7a3b5e282',
  },
  {
    package: '@deepseek-ai/dsh-experimental-browser-use-runtime',
    version: '0.2.1-alpha.2',
    files: [
      'LICENSE',
      'lib/index.js',
      'lib/types/index.d.ts',
      'lib/types/index.js',
      'lib/types/mcp.js',
      'package.json',
    ],
    sha256: '53da89bea6e40167489a759e69db4ba394f971290e90a302f889b0b65455e9de',
  },
  {
    package: '@deepseek-ai/dsh-mcp-client',
    version: '0.2.1-alpha.2',
    files: ['LICENSE', 'lib/index.js', 'lib/types/index.d.ts', 'package.json'],
    sha256: '562dd8f64e4c9b0e1788fca0055b47fe4cd39c979f3ae2837321a3f83d668560',
  },
  {
    package: '@deepseek-ai/dsh-mcp-resources',
    version: '0.2.1-alpha.2',
    files: ['LICENSE', 'lib/index.js', 'lib/types/index.d.ts', 'package.json'],
    sha256: '9c095f3ed1fc7933f525b1f818c515f1099af0be77c67c1c65f05f42ac02baef',
  },
  {
    package: '@playwright/mcp',
    version: '0.0.80',
    files: ['LICENSE', 'cli.js', 'index.js', 'package.json'],
    sha256: '1f784e2c202b0b7f408e6ced04d7c773b0755ee524584ea42a00e81e553c6234',
  },
  {
    package: 'playwright-core',
    version: '1.63.0-alpha-2026-08-31',
    files: ['LICENSE', 'lib/coreBundle.js', 'lib/utilsBundle.js', 'package.json'],
    sha256: '83e5b9b5ed64783df54b9c2b7f04d559b8010888cf78c1cf1285cd5318c58ecb',
  },
  {
    package: 'playwright',
    version: '1.63.0-alpha-2026-08-31',
    files: ['LICENSE', 'package.json'],
    sha256: '02cee74946c7fd91fb8a4ed528b6d69c1ad83263e0b381f329fe52b0acfce7db',
  },
] as const;
