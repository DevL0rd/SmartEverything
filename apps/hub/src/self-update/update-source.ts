import { readFile } from 'node:fs/promises';
import { isMissing } from '../fs-util';
import type { HubLayout } from '../data-layout';
import {
  parseServiceConfigText,
  type CheckoutUpdateSource,
  type UpdateSource,
} from '../service/configuration';

async function configText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (cause) {
    if (isMissing(cause)) return undefined;
    throw cause;
  }
}

export async function findUpdateSource(layout: HubLayout): Promise<UpdateSource | undefined> {
  const path = layout.system.config.service;
  const text = await configText(path);
  return text === undefined ? undefined : parseServiceConfigText(path, text).updateSource;
}

export async function findCheckoutSource(
  layout: HubLayout,
): Promise<CheckoutUpdateSource | undefined> {
  const source = await findUpdateSource(layout);
  if (source?.checkout === undefined || source.remote === undefined) return undefined;
  return { ...source, checkout: source.checkout, remote: source.remote };
}
