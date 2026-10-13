import { afterEach, beforeEach, vi } from 'vitest';

// Existing fixtures are from February. Shift the clock while preserving elapsed
// wall time, which is required by the runtime-budget and fetch-timeout tests.
const originalDate = Date;
beforeEach(() => {
  const offset = originalDate.parse('2026-02-28T12:00:00.000Z') - originalDate.now();
  const shiftedDate = new Proxy(originalDate, {
    construct(target, args, newTarget) {
      return Reflect.construct(target, args.length ? args : [target.now() + offset], newTarget);
    },
    get(target, key, receiver) {
      if (key === 'now') return () => target.now() + offset;
      return Reflect.get(target, key, receiver);
    },
  });
  vi.stubGlobal('Date', shiftedDate);
});
afterEach(() => vi.unstubAllGlobals());
