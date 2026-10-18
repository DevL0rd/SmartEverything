import { homeLanAddress, lanInterfaces } from '../../../network/lan';

class RobotAddressNotOursError extends Error {
  override readonly name = 'RobotAddressNotOursError';

  constructor(readonly address: string) {
    super(`${address} is not an address of this computer`);
  }
}

export async function lanAddress(configured: string): Promise<string> {
  if (configured === '') return homeLanAddress();
  if (!lanInterfaces().some((entry) => entry.address === configured)) {
    throw new RobotAddressNotOursError(configured);
  }
  return configured;
}
