import { systemdUnit, type ServiceLaunch } from '../service/definitions.js';

const WORKING_DIRECTORY = /^WorkingDirectory=(.+)$/mu;
const PATH_ENVIRONMENT = /^Environment="PATH=((?:[^"\\]|\\.)*)"$/mu;
const EXEC_START = /^ExecStart="((?:[^"\\]|\\.)*)" "((?:[^"\\]|\\.)*)"$/mu;
const ANY_EXEC_START = /^ExecStart=(.+)$/gmu;
const LEFTOVER_SPECIFIER = /%[^%]/u;

export class UnitUnreadableError extends Error {
  override readonly name = 'UnitUnreadableError';

  constructor(file: string, reason: string) {
    super(`${file} can't be moved to a system service: ${reason}.`);
  }
}

function unescaped(value: string): string {
  return value.replaceAll('%%', '%').replaceAll(/\\(.)/gu, '$1');
}

function unescapedExec(value: string): string {
  return unescaped(value.replaceAll('$$', '$'));
}

function captured(file: string, pattern: RegExp, text: string, subject: string): RegExpExecArray {
  const match = pattern.exec(text);
  if (match === null) {
    throw new UnitUnreadableError(file, `it has no ${subject} line`);
  }
  return match;
}

function group(file: string, match: RegExpExecArray, index: number): string {
  const value = match[index];
  if (value === undefined) {
    throw new UnitUnreadableError(file, `part ${String(index)} of a line is missing`);
  }
  return value;
}

export function launchOfUserUnit(file: string, text: string): ServiceLaunch {
  const working = captured(file, WORKING_DIRECTORY, text, 'WorkingDirectory');
  const searchPath = captured(file, PATH_ENVIRONMENT, text, 'PATH');
  const exec = captured(file, EXEC_START, text, 'ExecStart');
  const launch: ServiceLaunch = {
    executable: unescapedExec(group(file, exec, 1)),
    entry: unescapedExec(group(file, exec, 2)),
    dataDirectory: group(file, working, 1).replaceAll('%%', '%'),
    path: unescaped(group(file, searchPath, 1)),
  };
  if (systemdUnit(launch) !== text) {
    throw new UnitUnreadableError(file, 'it was not written by SmartEverything or was edited');
  }
  return launch;
}

export function tunnelCommandOf(file: string, text: string, home: string): string {
  const lines = [...text.matchAll(ANY_EXEC_START)];
  const only = lines[0];
  if (lines.length !== 1 || only === undefined) {
    throw new UnitUnreadableError(
      file,
      `it must have exactly one ExecStart line, it has ${String(lines.length)}`,
    );
  }
  const command = group(file, only, 1).replaceAll('%h', home);
  if (LEFTOVER_SPECIFIER.test(command)) {
    throw new UnitUnreadableError(file, 'its ExecStart uses a systemd specifier other than %h');
  }
  return command;
}
