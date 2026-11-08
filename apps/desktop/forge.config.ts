import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { z } from 'zod';
import { generateIcons, iconPaths } from './packaging/icons.js';
import { desktopWebRuntime } from './packaging/web-runtime.js';
import { readBuildVariant } from './src/environment.js';
import { DESKTOP_VARIANTS } from './src/variant.js';

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(desktopDirectory, '..', 'app');
const webExport = path.join(appDirectory, 'dist');
const variant = DESKTOP_VARIANTS[readBuildVariant()];
const isRelease = variant.name === 'release';
const computerDirectory = path.join(desktopDirectory, 'dist', 'computer');
const buildComputer = path.resolve(
  desktopDirectory,
  '..',
  '..',
  'tooling',
  'build-desktop-client-service.ts',
);
const run = promisify(execFile);
const icon = isRelease
  ? path.join(appDirectory, 'assets', 'icon.png')
  : path.join(desktopDirectory, 'packaging', variant.name, 'icon.png');
const iconDirectory = path.join(desktopDirectory, 'dist', 'icons');
const trayIcons = path.join(desktopDirectory, 'assets', 'tray');
const icons = iconPaths(iconDirectory);

const PACKAGED_PATHS = ['/package.json', '/dist/src'];
const BUILD_ONLY_FILE = /\.(?:d\.c?ts|map)$/u;

function isLeftOut(file: string): boolean {
  if (file === '') {
    return false;
  }
  if (BUILD_ONLY_FILE.test(file)) {
    return true;
  }
  return !PACKAGED_PATHS.some(
    (kept) => file === kept || file.startsWith(`${kept}/`) || kept.startsWith(`${file}/`),
  );
}

async function stampPackage(buildPath: string): Promise<void> {
  const manifestFile = path.join(buildPath, 'package.json');
  const manifest = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(await readFile(manifestFile, 'utf8')));
  const stamped = {
    ...manifest,
    ...(isRelease ? {} : { productName: variant.productName, variant: variant.name }),
    webRuntime: await desktopWebRuntime(desktopDirectory),
    webEmbedded: { createdAt: new Date().toISOString() },
  };
  await writeFile(manifestFile, `${JSON.stringify(stamped, null, 2)}\n`);
}

const linuxPackage = {
  name: variant.executableName,
  productName: variant.productName,
  genericName: 'Smart home',
  icon: icons.linux,
  categories: ['Utility' as const],
  mimeType: ['x-scheme-handler/smarteverything'],
};

const config: ForgeConfig = {
  packagerConfig: {
    name: variant.productName,
    executableName: variant.executableName,
    appBundleId: variant.appBundleId,
    asar: true,
    icon: icons.base,
    extraResource: isRelease ? [icon, trayIcons, webExport, computerDirectory] : [icon, trayIcons],
    ignore: isLeftOut,
    protocols: [{ name: variant.productName, schemes: [variant.scheme] }],
  },
  makers: [
    new MakerZIP({}, ['linux', 'darwin']),
    new MakerDMG({ icon: icons.icns }),
    new MakerSquirrel({ name: 'smarteverything', setupIcon: icons.ico }),
    new MakerDeb({ options: linuxPackage }),
    new MakerRpm({ options: linuxPackage }),
  ],
  hooks: {
    generateAssets: async (_config, platform, arch) => {
      await generateIcons(icon, iconDirectory);
      if (isRelease) {
        await run(process.execPath, [
          '--import',
          'tsx',
          buildComputer,
          '--platform',
          platform,
          '--arch',
          arch,
        ]);
      }
    },
    packageAfterCopy: async (_config, buildPath) => {
      await stampPackage(buildPath);
    },
  },
  plugins: [
    new FusesPlugin({
      version: FuseVersion.V1,
      strictlyRequireAllFuses: true,
      [FuseV1Options.RunAsNode]: true,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
      [FuseV1Options.WasmTrapHandlers]: true,
    }),
  ],
};

export default config;
