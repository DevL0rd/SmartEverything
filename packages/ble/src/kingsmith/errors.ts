export class WilinkFrameError extends Error {
  override readonly name = 'WilinkFrameError';
}

export class FtmsFrameError extends Error {
  override readonly name = 'FtmsFrameError';
}

export class VendorFrameError extends Error {
  override readonly name = 'VendorFrameError';
}

export class ForbiddenFrameError extends Error {
  override readonly name = 'ForbiddenFrameError';
}

export class UnsupportedCommandError extends Error {
  override readonly name = 'UnsupportedCommandError';
}

export class UnknownTreadmillFamilyError extends Error {
  override readonly name = 'UnknownTreadmillFamilyError';
}
