import { z } from 'zod';
import { PHONE_HARDWARE, type PhoneHardware, type PhoneReport } from '@smarteverything/domain';

const ANDROID_CONSTANTS = z.object({ Model: z.string(), Manufacturer: z.string() });

export function phoneHardwareOf(constants: unknown): PhoneHardware | undefined {
  const reported = ANDROID_CONSTANTS.safeParse(constants);
  if (!reported.success) return undefined;
  const hardware = PHONE_HARDWARE.safeParse({
    model: reported.data.Model,
    manufacturer: reported.data.Manufacturer,
  });
  return hardware.success ? hardware.data : undefined;
}

export function hardwareReportOf(hardware: PhoneHardware, at: Date): PhoneReport {
  return { at: at.toISOString(), values: {}, events: [], hardware };
}
