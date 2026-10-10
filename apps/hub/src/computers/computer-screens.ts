import { ApiError, COMPUTER_CAPTURE, type CaptureTarget } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { ComputerAccess, guarded } from './computer-access';
import type { ComputerDirectory } from './computer-directory';

export interface ComputerScreenTarget {
  readonly id: string;
  readonly kind: 'computer';
  readonly label: string;
  readonly ready: boolean;
  readonly windows: boolean;
}

export interface ComputerScreenChoice {
  readonly target: 'screen' | 'window' | 'focused';
  readonly display: string | null;
  readonly window: string | null;
}

export interface ComputerScreenPicture {
  readonly data: Buffer;
  readonly mimeType: 'image/jpeg';
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly at: string;
}

export interface ComputerScreenSource {
  readonly kind: 'computer';
  readonly targets: (profileId: string) => Promise<readonly ComputerScreenTarget[]>;
  readonly capture: (
    profileId: string,
    id: string,
    choice: ComputerScreenChoice,
  ) => Promise<ComputerScreenPicture>;
}

export interface ComputerScreenOptions {
  readonly store: Pick<Store, 'devices' | 'computerScopes'>;
  readonly directory: ComputerDirectory;
}

function targetOf(choice: ComputerScreenChoice): CaptureTarget {
  if (choice.target === 'window') {
    throw new ApiError('conflict', 'Computers can show the whole screen or the window in front.');
  }
  return choice.target;
}

export function computerScreens(options: ComputerScreenOptions): ComputerScreenSource {
  const access = new ComputerAccess(options.store);
  return {
    kind: 'computer',
    targets: () =>
      Promise.resolve(
        options.store.devices
          .list()
          .filter(
            (device) =>
              device.kind === 'computer' &&
              options.store.computerScopes.read(device.id).screenshots,
          )
          .map((device): ComputerScreenTarget => ({
            id: device.id,
            kind: 'computer',
            label: device.name,
            ready: options.directory.online(device.id) !== null,
            windows: false,
          })),
      ),
    capture: (_profileId, id, choice) =>
      guarded(async () => {
        access.require(id, 'screenshots');
        const target = targetOf(choice);
        const label = access.device(id).name;
        const capture = COMPUTER_CAPTURE.parse(
          await options.directory.byDevice(id).call({ verb: 'capture', target }),
        );
        return {
          data: Buffer.from(capture.data, 'base64'),
          mimeType: capture.mimeType,
          width: capture.width,
          height: capture.height,
          label,
          at: capture.at,
        };
      }),
  };
}
