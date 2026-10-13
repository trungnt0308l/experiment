import { afterEach, beforeEach, vi } from 'vitest';

// Calendar-based fixtures stay stable while runtime-budget tests observe real elapsed time.
const originalDate = Date;
beforeEach(() => {
  const offset = originalDate.parse('2026-02-28T12:00:00.000Z') - originalDate.now();
  vi.stubGlobal('Date', new Proxy(originalDate, {
    construct(target, args, newTarget) {
      return Reflect.construct(target, args.length ? args : [target.now() + offset], newTarget);
    },
    get(target, key, receiver) {
      if (key === 'now') return () => target.now() + offset;
      return Reflect.get(target, key, receiver);
    },
  }));
});
afterEach(() => vi.unstubAllGlobals());
