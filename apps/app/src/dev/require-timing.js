if (__DEV__) {
  const clock =
    typeof global.nativePerformanceNow === 'function'
      ? () => global.nativePerformanceNow()
      : () => Date.now();
  const key = (global.__METRO_GLOBAL_PREFIX__ || '') + '__SYSTRACE';
  const prefix = 'JS_require_';
  const keptMs = 0.5;
  const stack = [];
  const record = { slow: [], count: 0, totalMs: 0, firstAt: clock(), lastAt: 0 };
  let inner = null;
  const forward = (name, args) => (inner === null ? undefined : inner[name].apply(inner, args));
  const ended = (top) => {
    const inclusive = clock() - top.start;
    const self = inclusive - top.children;
    const parent = stack[stack.length - 1];
    if (parent !== undefined) {
      parent.children += inclusive;
    }
    if (!top.name.startsWith(prefix)) {
      return;
    }
    record.count += 1;
    record.totalMs += self;
    record.lastAt = clock();
    if (self >= keptMs) {
      record.slow.push([top.name.slice(prefix.length), Math.round(self * 10) / 10]);
    }
  };
  const timing = {
    isEnabled: (...args) => forward('isEnabled', args) === true,
    setEnabled: (...args) => forward('setEnabled', args),
    beginEvent: (...args) => {
      stack.push({ name: String(args[0]), start: clock(), children: 0 });
      return forward('beginEvent', args);
    },
    endEvent: (...args) => {
      const top = stack.pop();
      if (top !== undefined) {
        ended(top);
      }
      return forward('endEvent', args);
    },
    beginAsyncEvent: (...args) => forward('beginAsyncEvent', args),
    endAsyncEvent: (...args) => forward('endAsyncEvent', args),
    counterEvent: (...args) => forward('counterEvent', args),
  };
  global.__SE_REQUIRE_TIMES__ = record;
  Object.defineProperty(global, key, {
    configurable: true,
    get: () => timing,
    set: (next) => {
      inner = next;
    },
  });
}
