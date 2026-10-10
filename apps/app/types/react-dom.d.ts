declare module 'react-dom' {
  export function flushSync<Result>(update: () => Result): Result;
}
