const INPUT_TYPE = [
  'using System.Runtime.InteropServices;',
  'public static class SeInput {',
  '[DllImport("user32.dll")] public static extern void mouse_event(int flags, int dx, int dy, int data, int extra);',
  '}',
].join(' ');

export const WAKE_DISPLAY_SCRIPT = `if (-not ('SeInput' -as [type])) { Add-Type -TypeDefinition '${INPUT_TYPE}' }; [SeInput]::mouse_event(1, 0, 0, 0, 0); $null`;
