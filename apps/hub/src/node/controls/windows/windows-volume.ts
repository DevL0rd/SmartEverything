import { z } from 'zod';
import type { PowerShell } from '../../collectors/windows/powershell-session';
import type { RingSound, RingVolume } from '../machine-ring';

const RING_LEVEL = 100;

const CSHARP = [
  'using System;',
  'using System.Runtime.InteropServices;',
  '[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
  'interface IAudioEndpointVolume {',
  'int R0(); int R1(); int R2(); int R3();',
  'int SetMasterVolumeLevelScalar(float level, ref Guid context);',
  'int R5();',
  'int GetMasterVolumeLevelScalar(out float level);',
  'int R7(); int R8(); int R9(); int R10();',
  'int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);',
  'int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);',
  '}',
  '[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
  'interface IMMDevice {',
  'int Activate(ref Guid id, int context, IntPtr parameters, out IAudioEndpointVolume volume);',
  '}',
  '[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
  'interface IMMDeviceEnumerator {',
  'int R0();',
  'int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);',
  '}',
  '[ComImport, Guid("BCDE0395-E52F-49B1-8D21-DCE1B12D3B1B")] class MMDeviceEnumeratorObject { }',
  'public static class SeAudio {',
  'static IAudioEndpointVolume Endpoint() {',
  'var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorObject());',
  'IMMDevice device; Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));',
  'var id = typeof(IAudioEndpointVolume).GUID; IAudioEndpointVolume volume;',
  'Marshal.ThrowExceptionForHR(device.Activate(ref id, 23, IntPtr.Zero, out volume));',
  'return volume;',
  '}',
  'public static float Level() { float level; Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(out level)); return level; }',
  'public static bool Muted() { bool muted; Marshal.ThrowExceptionForHR(Endpoint().GetMute(out muted)); return muted; }',
  'public static void Set(float level, bool muted) {',
  'var context = Guid.Empty; var volume = Endpoint();',
  'Marshal.ThrowExceptionForHR(volume.SetMute(muted, ref context));',
  'Marshal.ThrowExceptionForHR(volume.SetMasterVolumeLevelScalar(level, ref context));',
  '}',
  '}',
].join(' ');

const AUDIO_TYPES = `if (-not ('SeAudio' -as [type])) { Add-Type -TypeDefinition '${CSHARP}' }`;

const CURRENT_SCRIPT = `${AUDIO_TYPES}; [pscustomobject]@{ volume = [math]::Round([SeAudio]::Level() * 100); muted = [SeAudio]::Muted() }`;

function setScript(level: number, muted: boolean): string {
  return `${AUDIO_TYPES}; [SeAudio]::Set(${String(level / 100)}, $${muted ? 'true' : 'false'}); $null`;
}

const SOUND = z.object({ volume: z.number(), muted: z.boolean() });

export function windowsVolume(shell: PowerShell): RingVolume {
  return {
    current: (): Promise<RingSound> => shell.run(CURRENT_SCRIPT, SOUND),
    raise: async (): Promise<void> => {
      await shell.run(setScript(RING_LEVEL, false), z.null());
    },
    restore: async (sound): Promise<void> => {
      await shell.run(setScript(sound.volume, sound.muted), z.null());
    },
  };
}
