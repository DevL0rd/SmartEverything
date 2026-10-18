import type { SystemState } from '@smarteverything/domain';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { ToolProbe } from './tool-probe';

type Keyboard = NonNullable<SystemState['keyboard']>;

const LAYOUTS = ['org.kde.keyboard', '/Layouts', 'org.kde.KeyboardLayouts'] as const;

const LIST = z.object({
  data: z.tuple([z.array(z.tuple([z.string(), z.string(), z.string()]))]),
});

const INDEX = z.object({ data: z.tuple([z.number().int().nonnegative()]) });

const QUERY = ['--user', '--json=short', 'call', ...LAYOUTS, 'getLayout'];

function idOf(short: string, variant: string): string {
  return variant === '' ? short : `${short}:${variant}`;
}

export class KeyboardLayouts {
  constructor(
    private readonly run: RunProgram,
    private readonly probe: ToolProbe,
  ) {}

  supported(): Promise<boolean> {
    return this.probe.available('busctl', QUERY);
  }

  async read(): Promise<Keyboard | null> {
    if (!(await this.supported())) {
      return null;
    }
    const layouts = await this.list();
    const index = INDEX.parse(JSON.parse(await this.run('busctl', QUERY))).data[0];
    const current = layouts[index];
    return current === undefined ? null : { layouts: [...layouts], current: current.id };
  }

  async set(layout: string): Promise<void> {
    const layouts = await this.list();
    const wanted = layout.toLowerCase();
    const index = layouts.findIndex(
      (candidate) =>
        candidate.id.toLowerCase() === wanted || candidate.name.toLowerCase() === wanted,
    );
    if (index < 0) {
      throw new NodeFailureError(
        'not_found',
        `This computer has no keyboard layout called ${layout}.`,
      );
    }
    await this.run('busctl', ['--user', 'call', ...LAYOUTS, 'setLayout', 'u', String(index)]);
  }

  private async list(): Promise<readonly { readonly id: string; readonly name: string }[]> {
    const output = await this.run('busctl', [
      '--user',
      '--json=short',
      'call',
      ...LAYOUTS,
      'getLayoutsList',
    ]);
    return LIST.parse(JSON.parse(output)).data[0].map(([short, variant, name]) => ({
      id: idOf(short, variant),
      name,
    }));
  }
}
