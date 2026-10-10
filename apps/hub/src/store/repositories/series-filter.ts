import type { SQLInputValue } from 'node:sqlite';

export interface Filter {
  readonly text: string;
  readonly parameters: Record<string, SQLInputValue>;
}

export function listFilter(column: string, name: string, values: readonly string[]): Filter {
  const parameters: Record<string, SQLInputValue> = {};
  const names = values.map((value, index) => {
    parameters[`${name}${String(index)}`] = value;
    return `$${name}${String(index)}`;
  });
  return { text: `${column} in (${names.join(', ')})`, parameters };
}
