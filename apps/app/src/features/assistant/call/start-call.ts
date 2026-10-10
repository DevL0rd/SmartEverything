import { router } from 'expo-router';
import type { CallSource } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { recentChatId } from '../data/recent-chat';

export interface StartCallOptions {
  readonly source: CallSource;
  readonly chatId?: string;
}

export function startCall(options: StartCallOptions): void {
  router.push(href.assistantCall(options.source, options.chatId ?? recentChatId()));
}
