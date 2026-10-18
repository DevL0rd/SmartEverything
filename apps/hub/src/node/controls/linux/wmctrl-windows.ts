import type { WindowAction, WindowRow } from '@smarteverything/domain';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { LineSubscriber } from './line-stream';
import type { ProgramProbe } from './program-probe';
import type { WindowProvider } from './window-provider';

const LINE = /^(0x[0-9a-f]+)\s+(-?\d+)\s+(\S+)\s+(\S+)\s?(.*)$/;
const ACTIVE = /(0x[0-9a-f]+)/;
const ALL_DESKTOPS = -1;

function appOf(windowClass: string): WindowRow['app'] {
  const name = windowClass.split('.').at(-1) ?? windowClass;
  return name === '' ? null : { id: windowClass, name };
}

export function parseWmctrl(text: string, active: string | null): WindowRow[] {
  return text.split('\n').flatMap((line) => {
    const match = LINE.exec(line);
    if (match === null) {
      return [];
    }
    const [, id, desktop, windowClass, , title] = match;
    if (id === undefined || windowClass === undefined) {
      return [];
    }
    return [
      {
        id,
        title: title ?? '',
        app: appOf(windowClass),
        desktop: Number(desktop) === ALL_DESKTOPS ? null : String(Number(desktop) + 1),
        minimised: false,
        focused: id === active,
      },
    ];
  });
}

export function parseActive(text: string): string | null {
  const id = ACTIVE.exec(text)?.[1];
  return id === undefined ? null : `0x${id.slice(2).padStart(8, '0')}`;
}

export class WmctrlWindows implements WindowProvider {
  constructor(
    private readonly run: RunProgram,
    private readonly probe: ProgramProbe,
    private readonly lines: LineSubscriber,
  ) {}

  async list(): Promise<WindowRow[]> {
    const text = await this.run('wmctrl', ['-lx']);
    const active = (await this.probe('xprop'))
      ? parseActive(await this.run('xprop', ['-root', '_NET_ACTIVE_WINDOW']))
      : null;
    return parseWmctrl(text, active);
  }

  async act(windowId: string, action: WindowAction): Promise<boolean> {
    if (!(await this.list()).some((row) => row.id === windowId)) {
      return false;
    }
    switch (action) {
      case 'focus':
        await this.run('wmctrl', ['-i', '-a', windowId]);
        return true;
      case 'close':
        await this.run('wmctrl', ['-i', '-c', windowId]);
        return true;
      case 'minimise':
        if (!(await this.probe('xdotool'))) {
          throw new NodeFailureError('not_supported', 'Minimising needs xdotool on this computer.');
        }
        await this.run('xdotool', ['windowminimize', String(Number.parseInt(windowId, 16))]);
        return true;
    }
  }

  watch(onChange: () => void, onFailure: (cause: unknown) => void): Promise<() => void> {
    return Promise.resolve(
      this.lines({
        program: 'xprop',
        args: ['-root', '-spy', '_NET_CLIENT_LIST', '_NET_ACTIVE_WINDOW'],
        onLine: onChange,
        onFailure,
      }),
    );
  }
}
