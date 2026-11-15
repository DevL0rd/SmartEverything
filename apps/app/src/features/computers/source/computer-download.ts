import { prepareComputerDownload } from '../../../api/computer-downloads';
import type { PreparedDownload } from '../../files';
import type { ComputerNode } from './computer-node';

export function prepareDownloadOf(
  deviceId: string,
  nodes: readonly ComputerNode[],
): Promise<PreparedDownload> {
  return prepareComputerDownload(
    deviceId,
    nodes.map((node) => node.origin.path),
  );
}
