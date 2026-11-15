import {
  API_ENDPOINTS as E,
  type MailSettings,
  type MailTestResult,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { api } from './transport';

type Body<K extends keyof typeof E> = z.input<(typeof E)[K]['body']>;

export async function readMailSettings(): Promise<MailSettings | null> {
  return api().call(E.readMailSettings, {});
}

export async function writeMailSettings(body: Body<'writeMailSettings'>): Promise<MailSettings> {
  return api().call(E.writeMailSettings, { body });
}

export async function sendMailTest(body: Body<'sendMailTest'>): Promise<MailTestResult> {
  return api().call(E.sendMailTest, { body });
}
