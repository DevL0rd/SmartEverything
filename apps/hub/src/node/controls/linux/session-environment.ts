import { env } from 'node:process';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';

const OPTIONAL = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value));

const SESSION_ENVIRONMENT = z.object({
  DBUS_SESSION_BUS_ADDRESS: OPTIONAL,
  XDG_RUNTIME_DIR: OPTIONAL,
  XDG_CURRENT_DESKTOP: OPTIONAL,
  XDG_DATA_HOME: OPTIONAL,
  XDG_DATA_DIRS: OPTIONAL,
});

export type SessionEnvironment = z.output<typeof SESSION_ENVIRONMENT>;

export function sessionEnvironment(): SessionEnvironment {
  return SESSION_ENVIRONMENT.parse(env);
}

export function runtimeDirectory(): string {
  const directory = sessionEnvironment().XDG_RUNTIME_DIR;
  if (directory === null) {
    throw new NodeFailureError('no_session', 'Nobody is signed in on this computer.');
  }
  return directory;
}

export function isKdePlasma(): boolean {
  return sessionEnvironment().XDG_CURRENT_DESKTOP?.split(':').includes('KDE') === true;
}
