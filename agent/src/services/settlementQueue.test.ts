import { describe, expect, it } from 'vitest';

import type { JobState } from './settlementQueue.js';
import { SettlementQueue } from './settlementQueue.js';

describe('SettlementQueue', () => {
  it('settles a job that succeeds on the first attempt', async () => {
    const transitions: JobState[] = [];
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const queue = new SettlementQueue(
      { baseDelayMs: 5 },
      {
        onStateChange: (_id, state) => {
          transitions.push(state);
          if (state === 'settled' || state === 'failed') {
            resolveDone();
          }
        },
      },
    );

    queue.enqueue({ id: 'a', execute: () => Promise.resolve() });
    await done;

    expect(transitions).toEqual(['queued', 'processing', 'settled']);
  });

  it('retries a recoverable failure and eventually settles', async () => {
    const transitions: JobState[] = [];
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const queue = new SettlementQueue(
      { baseDelayMs: 5, maxAttempts: 3 },
      {
        onStateChange: (_id, state) => {
          transitions.push(state);
          if (state === 'settled' || state === 'failed') {
            resolveDone();
          }
        },
      },
    );

    let attempts = 0;
    queue.enqueue({
      id: 'b',
      execute: () => {
        attempts += 1;
        if (attempts < 2) {
          return Promise.reject(new Error('transient'));
        }
        return Promise.resolve();
      },
    });
    await done;

    expect(attempts).toBe(2);
    expect(transitions).toEqual(['queued', 'processing', 'retrying', 'processing', 'settled']);
  });

  it('marks a job permanently failed after exhausting maxAttempts', async () => {
    const transitions: JobState[] = [];
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const queue = new SettlementQueue(
      { baseDelayMs: 5, maxAttempts: 2 },
      {
        onStateChange: (_id, state) => {
          transitions.push(state);
          if (state === 'settled' || state === 'failed') {
            resolveDone();
          }
        },
      },
    );

    let attempts = 0;
    queue.enqueue({
      id: 'c',
      execute: () => {
        attempts += 1;
        return Promise.reject(new Error('always fails'));
      },
    });
    await done;

    expect(attempts).toBe(2);
    expect(transitions).toEqual(['queued', 'processing', 'retrying', 'processing', 'failed']);
  });

  it('processes jobs one at a time, in enqueue order', async () => {
    const order: string[] = [];
    const queue = new SettlementQueue({ baseDelayMs: 5 });

    const jobA = new Promise<void>((resolve) => {
      queue.enqueue({
        id: 'x',
        execute: async () => {
          order.push('x-start');
          await new Promise((r) => setTimeout(r, 20));
          order.push('x-end');
          resolve();
        },
      });
    });
    const jobB = new Promise<void>((resolve) => {
      queue.enqueue({
        id: 'y',
        execute: async () => {
          order.push('y-start');
          resolve();
        },
      });
    });

    // Immediately after enqueueing both, both should be counted as queued/processing.
    expect(queue.depth()).toBe(2);

    await Promise.all([jobA, jobB]);

    expect(order).toEqual(['x-start', 'x-end', 'y-start']);
  });

  it('reports queue depth including the currently-processing job, then drains to zero', async () => {
    const queue = new SettlementQueue({ baseDelayMs: 5 });
    expect(queue.depth()).toBe(0);

    const settled = new Promise<void>((resolve) => {
      queue.enqueue({ id: 'd', execute: () => Promise.resolve().then(resolve) });
    });

    await settled;
    // Give the queue's internal `drain` loop a tick to flip `processing` back to false.
    await new Promise((r) => setTimeout(r, 0));
    expect(queue.depth()).toBe(0);
  });
});
