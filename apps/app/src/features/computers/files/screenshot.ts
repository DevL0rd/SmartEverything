import { useMutation } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type CaptureTarget } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { useComputerReach } from '../data/computer-scopes';
import { NO_CHAT_REASON, pickedFromBase64, useChatAttach } from './chat-attach';

export interface ScreenshotAction {
  readonly run: () => void;
  readonly pending: boolean;
  readonly reason: string | null;
}

function stamp(at: string): string {
  return at.slice(0, 19).replace(/[:T]/g, '-');
}

export function useScreenshotToChat(
  deviceId: string,
  target: CaptureTarget = 'screen',
): ScreenshotAction {
  const reach = useComputerReach(deviceId);
  const chat = useChatAttach();
  const shot = useMutation({
    mutationFn: () => api().call(E.captureComputer, { params: { deviceId }, body: { target } }),
    onSuccess: (capture) => {
      chat.attach(
        pickedFromBase64(
          `screenshot-${stamp(capture.at)}.jpg`,
          capture.mimeType,
          capture.data,
          `data:${capture.mimeType};base64,${capture.data}`,
        ),
      );
    },
    onError: (error) => {
      notify({ message: `Couldn’t take a screenshot of ${reach.name}`, error, tone: 'critical' });
    },
  });
  const reason = !reach.owner
    ? 'Only the owner can take screenshots.'
    : !reach.online
      ? `${reach.name} is offline.`
      : chat.available
        ? null
        : NO_CHAT_REASON;
  return {
    run: (): void => {
      shot.mutate();
    },
    pending: shot.isPending,
    reason,
  };
}
