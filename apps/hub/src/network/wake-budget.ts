export const WAKE_BOOT_MS = 45_000;

export const WAKE_BURSTS = 3;

export const WAKE_RESENDS_MS: readonly number[] = Array.from(
  { length: WAKE_BURSTS - 1 },
  (_, index) => ((index + 1) * WAKE_BOOT_MS) / WAKE_BURSTS,
);
