import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { windowStateSchema, type WindowState } from './window-bounds.js';

export const WINDOW_STATE_FILE = 'window-state.json';

export class WindowStateInvalidError extends Error {
  readonly file: string;

  constructor(file: string, received: string) {
    super(
      `the saved window state ${file} must hold integer bounds and a maximized flag; ` +
        `received content that fails with: ${received}`,
    );
    this.name = 'WindowStateInvalidError';
    this.file = file;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function readText(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

function parseJson(file: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      throw new WindowStateInvalidError(file, error.message);
    }
    throw error;
  }
}

export function readWindowState(file: string): WindowState | undefined {
  const text = readText(file);
  if (text === undefined) {
    return undefined;
  }
  const parsed = windowStateSchema.safeParse(parseJson(file, text));
  if (!parsed.success) {
    throw new WindowStateInvalidError(file, z.prettifyError(parsed.error));
  }
  return parsed.data;
}

export function writeWindowState(file: string, state: WindowState): void {
  writeFileSync(file, JSON.stringify(state), 'utf8');
}
