import { ToolHub } from '../../ai-tools/tool-hub';

export function scopedHub(hub: ToolHub | null, allowed: readonly string[] | null): ToolHub | null {
  if (hub === null || allowed === null) {
    return hub;
  }
  const names = new Set(allowed);
  return new ToolHub([
    {
      tools: () => hub.list().filter((tool) => names.has(tool.name)),
      call: (tool, args, caller) => hub.call(tool.name, args, caller),
      validate: (tool, args): string | null => {
        const check = hub.check(tool.name, args);
        return check.ok ? null : check.reason;
      },
      changes: (listener) => hub.changes(listener),
    },
  ]);
}
