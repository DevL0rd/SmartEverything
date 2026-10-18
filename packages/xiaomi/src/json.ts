export function parseJson(text: string, reject: (cause: string) => Error): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw reject(String(cause));
  }
}
