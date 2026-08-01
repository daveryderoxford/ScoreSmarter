import { withTimeout } from './with-timeout';

describe('withTimeout', () => {
  it('resolves when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it('rejects when the promise exceeds the timeout', async () => {
    const slow = new Promise<number>(resolve => {
      setTimeout(() => resolve(1), 50);
    });
    await expect(withTimeout(slow, 5, 'Saving entry')).rejects.toThrow(/timed out after/);
  });
});
