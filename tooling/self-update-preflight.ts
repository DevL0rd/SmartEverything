export const MINIMUM_NODE_MAJOR = 26;

const TYPE_ERROR_LINE = /^apps\/hub\/src\/.* error TS\d+:/u;

export function countHubTypeErrors(output: string): number {
  return output.split('\n').filter((line) => TYPE_ERROR_LINE.test(line)).length;
}
