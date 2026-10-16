import { useState } from 'react';
import { z } from 'zod';
import { callPluginTool } from '../../api/plugins';
import { rawErrorText } from '../../format/errors';
import { plural } from '../../format/text';

const SCAN_RESULT = z.object({
  devices: z.array(z.object({ externalId: z.string(), online: z.boolean() })).max(512),
  discoveryAvailable: z.boolean(),
});

type DiscoveryState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'scanning' }
  | { readonly phase: 'done'; readonly message: string }
  | { readonly phase: 'failed'; readonly message: string };

function scanMessage(result: z.output<typeof SCAN_RESULT>): string {
  if (!result.discoveryAvailable) return 'Your server has no local IPv4 network to search.';
  if (result.devices.length === 0)
    return 'No WiZ lights answered. Check that they are powered, on your server’s network, and allow local communication in WiZ settings.';
  const reachable = result.devices.filter((device) => device.online).length;
  return `Scan finished. ${plural(result.devices.length, 'known light')}, ${String(reachable)} reachable. Open a light for all its controls.`;
}

export function useWizDiscovery(): {
  readonly state: DiscoveryState;
  readonly discover: () => Promise<void>;
} {
  const [state, setState] = useState<DiscoveryState>({ phase: 'idle' });
  const discover = async (): Promise<void> => {
    if (state.phase === 'scanning') return;
    setState({ phase: 'scanning' });
    try {
      const response = await callPluginTool('wiz', 'rescan', {});
      setState({ phase: 'done', message: scanMessage(SCAN_RESULT.parse(response.result)) });
    } catch (error) {
      setState({ phase: 'failed', message: `Discovery failed: ${rawErrorText(error)}` });
    }
  };
  return { state, discover };
}
