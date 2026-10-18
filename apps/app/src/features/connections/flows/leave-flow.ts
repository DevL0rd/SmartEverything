import { closeFlow } from '../../../app-shell/close-flow';
import { href } from '../../../app-shell/hrefs';

export function leaveFlow(): void {
  closeFlow(href.settings.index());
}
