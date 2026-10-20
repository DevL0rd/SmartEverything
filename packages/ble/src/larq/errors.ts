export class LarqFrameError extends Error {
  override readonly name = 'LarqFrameError';
}

export class LarqRefusedError extends Error {
  override readonly name = 'LarqRefusedError';
}

export class LarqResponseError extends Error {
  override readonly name = 'LarqResponseError';
}

export class LarqIdentityError extends Error {
  override readonly name = 'LarqIdentityError';
}

export class LarqCalibrationError extends Error {
  override readonly name = 'LarqCalibrationError';
}
