import { useEffect, useState } from 'react';
import {
  DESKTOP_COMPUTER_IDENTITY,
  type DesktopComputerIdentity,
  type DesktopDrive,
  type DesktopDriveCommand,
  type DesktopDriveState,
  type DesktopPlatform,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { desktopBridge, type DesktopBridge } from '../../../design/platform';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useMutationState } from '../../../store/mutation';

export const IDENTITY_KEY = ['window', 'desktop-computer-identity'] as const;

export interface ThisComputer {
  readonly deviceId: string;
  readonly platform: DesktopPlatform;
}

class ThisComputerUnknownError extends Error {
  override readonly name = 'ThisComputerUnknownError';
  constructor() {
    super('This computer’s identity is unavailable. Update or reconnect this desktop.');
  }
}

function identityOf(bridge: DesktopBridge | null): () => Promise<DesktopComputerIdentity> {
  return async () => {
    if (bridge?.computerIdentity === undefined) throw new ThisComputerUnknownError();
    return DESKTOP_COMPUTER_IDENTITY.parse(await bridge.computerIdentity());
  };
}

export function useThisComputer(): ThisComputer | null {
  const bridge = desktopBridge();
  const identity = useScreenQuery({
    queryKey: IDENTITY_KEY,
    retry: false,
    enabled: bridge !== null,
    queryFn: identityOf(bridge),
  });
  const deviceId = identity.data?.device_id ?? null;
  return bridge === null || deviceId === null ? null : { deviceId, platform: bridge.platform };
}

function useDriveState(drive: DesktopDrive | undefined): DesktopDriveState | null {
  const [state, setState] = useState<DesktopDriveState | null>(null);
  useEffect(() => {
    if (drive === undefined) return undefined;
    let pushed = false;
    const off = drive.onChange((next) => {
      pushed = true;
      setState(next);
    });
    background(
      drive.state().then((first) => {
        if (!pushed) setState(first);
      }),
      'drive.desktop_state_failed',
    );
    return off;
  }, [drive]);
  return state;
}

export interface DesktopDriveView {
  readonly state: DesktopDriveState | null;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly run: (command: DesktopDriveCommand, failure: string, onDone?: () => void) => void;
}

export function useDesktopDrive(): DesktopDriveView | null {
  const drive = desktopBridge()?.drive;
  const state = useDriveState(drive);
  const mutation = useMutationState();
  if (drive === undefined) return null;
  return {
    state,
    busy: mutation.busy,
    problem: mutation.problem,
    run: (command, failure, onDone): void => {
      mutation.run(() => drive.run(command), {
        failure,
        label: `drive.desktop.${command.kind}`,
        inline: true,
        ...(onDone === undefined ? {} : { onDone }),
      });
    },
  };
}
