import { NodeFailureError } from '../../node-failure';
import type { ProgramProbe } from './program-probe';

export interface AudioTool {
  readonly program: string;
  readonly args: readonly string[];
}

export async function firstInstalled(
  probe: ProgramProbe,
  tools: readonly AudioTool[],
  purpose: string,
): Promise<AudioTool> {
  for (const tool of tools) {
    if (await probe(tool.program)) {
      return tool;
    }
  }
  const names = tools.map((tool) => tool.program).join(' or ');
  throw new NodeFailureError('not_supported', `${purpose} needs ${names}, and none is installed.`);
}
