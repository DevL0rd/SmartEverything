import { router } from 'expo-router';
import { closeFlow } from '../../../app-shell/close-flow';
import { href } from '../../../app-shell/hrefs';

export function leaveChat(): void {
  closeFlow(href.assistantChat());
}

export function leaveToChatList(): void {
  router.replace(href.assistantChat());
}
