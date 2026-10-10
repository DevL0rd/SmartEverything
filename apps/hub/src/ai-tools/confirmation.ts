import type { HubTool } from './hub-tool';

export function needsConfirmation(tool: HubTool, args: Readonly<Record<string, unknown>>): boolean {
  return tool.humanOnly || tool.confirms(args) || args['confirm'] === true;
}

export function confirmationRequest(tool: HubTool): Readonly<Record<string, unknown>> {
  return {
    needs_confirmation: `Before doing this, ask them to confirm: ${tool.title}. Call the same tool again with the same arguments only after they say yes.`,
  };
}
