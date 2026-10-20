import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
import { GO2RTC_RESOURCE_DIRECTORY, stageGo2rtc } from './src/service/go2rtc-binary.js';
import { readBuildVariant } from './src/environment.js';
import { stageFfmpeg } from './src/service/ffmpeg-binary.js';
import { DESKTOP_VARIANTS } from './src/variant.js';

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(desktopDirectory, '..', 'app');
const hubManifestFile = path.resolve(desktopDirectory, '..', 'hub', 'package.json');
const webExport = path.join(appDirectory, 'dist');
const variant = DESKTOP_VARIANTS[readBuildVariant()];
const isRelease = variant.name === 'release';
const icon = isRelease
  ? path.join(appDirectory, 'assets', 'icon.png')
  : path.join(desktopDirectory, 'packaging', variant.name, 'icon.png');
const iconDirectory = path.join(desktopDirectory, 'dist', 'icons');
const trayIcons = path.join(desktopDirectory, 'assets', 'tray');
const icons = iconPaths(iconDirectory);
const serviceDirectory = path.join(desktopDirectory, 'dist', 'service');
const go2rtcBuilds = path.resolve(desktopDirectory, '..', '..', 'tooling', 'go2rtc', 'out');
const go2rtcStage = path.join(desktopDirectory, 'dist', GO2RTC_RESOURCE_DIRECTORY);

const PACKAGED_PATHS = ['/package.json', '/dist/src'];
const BUILD_ONLY_FILE = /\.(?:d\.c?ts|map)$/u;

const CLAUDE_SDK = '@anthropic-ai/claude-agent-sdk';
const HUB_MANIFEST = z.object({ dependencies: z.object({ [CLAUDE_SDK]: z.string() }) });

async function pinnedClaudeSdkVersion(): Promise<string> {
  const hub = HUB_MANIFEST.parse(JSON.parse(await readFile(hubManifestFile, 'utf8')));
  return hub.dependencies[CLAUDE_SDK];
}

async function checkClaudeRuntime(platform: string, arch: string): Promise<void> {
  const name = `${CLAUDE_SDK}-${platform}-${arch}`;
  const directory = path.join(serviceDirectory, 'node_modules', name);
  const manifest = z.object({
    name: z.literal(name),
    version: z.literal(await pinnedClaudeSdkVersion()),
  });
  try {
    manifest.parse(JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')));
    const binary = path.join(directory, platform === 'win32' ? 'claude.exe' : 'claude');
    if (!(await stat(binary)).isFile()) throw new Error('The installed SDK binary is missing.');
  } catch (cause) {
    throw new Error(
      `Install the pinned official Claude SDK optional package ${name} for this packaging target before building its installer.`,
      { cause },
    );
  }
}

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

async function markVariant(buildPath: string): Promise<void> {
  const manifestFile = path.join(buildPath, 'package.json');
  const manifest = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(await readFile(manifestFile, 'utf8')));
  const marked = { ...manifest, productName: variant.productName, variant: variant.name };
  await writeFile(manifestFile, `${JSON.stringify(marked, null, 2)}\n`);
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
    extraResource: isRelease
      ? [webExport, icon, trayIcons, serviceDirectory, go2rtcStage]
      : [icon, trayIcons],
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
      if (isRelease) await checkClaudeRuntime(platform, arch);
      await generateIcons(icon, iconDirectory);
      if (isRelease) {
        await stageGo2rtc(go2rtcBuilds, go2rtcStage, platform, arch);
        await stageFfmpeg(serviceDirectory, platform, arch);
      }
    },
    packageAfterCopy: async (_config, buildPath) => {
      if (!isRelease) {
        await markVariant(buildPath);
      }
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
