import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { APP_START_URL, METRO_START_URL } from './origin.js';

const MANIFEST_FILE = 'package.json';

export const VARIANT_NAME = z.enum(['release', 'development']);

export type DesktopVariantName = z.infer<typeof VARIANT_NAME>;

export interface DesktopVariant {
  readonly name: DesktopVariantName;
  readonly productName: string;
  readonly executableName: string;
  readonly appBundleId: string;
  readonly scheme: string;
  readonly startUrl: string;
  readonly managedBy?: 'stable-app';
}

export const DESKTOP_VARIANTS: Readonly<Record<DesktopVariantName, DesktopVariant>> = {
  release: {
    name: 'release',
    productName: 'SmartEverything',
    executableName: 'smarteverything',
    appBundleId: 'app.smarteverything.desktop',
    scheme: 'smarteverything',
    startUrl: APP_START_URL,
  },
  development: {
    name: 'development',
    productName: 'SmartEverything Dev',
    executableName: 'smarteverything-dev',
    appBundleId: 'app.smarteverything.desktop.dev',
    scheme: 'smarteverything-dev',
    startUrl: METRO_START_URL,
    managedBy: 'stable-app',
  },
};

const MANIFEST = z.object({ variant: VARIANT_NAME.default('release') });

export function variantOfManifest(text: string): DesktopVariant {
  return DESKTOP_VARIANTS[MANIFEST.parse(JSON.parse(text)).variant];
}

export function readDesktopVariant(appPath: string): DesktopVariant {
  return variantOfManifest(readFileSync(path.join(appPath, MANIFEST_FILE), 'utf8'));
}
