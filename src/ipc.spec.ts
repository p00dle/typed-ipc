import { describe, it, expect } from 'vitest';
import { IPC } from './ipc';

type UntypedIpc = IPC<Record<string, unknown>, Record<string, unknown>>;

function createTwoWayIpc(): [UntypedIpc, UntypedIpc] {
  const listeners1: ((message: unknown) => void)[] = [];
  const listeners2: ((message: unknown) => void)[] = [];
  function send1(message: unknown) {
    for (const listener of listeners2) listener(message);
  }
  function send2(message: unknown) {
    for (const listener of listeners1) listener(message);
  }
  function addListener1(listener: (message: unknown) => void) {
    listeners1.push(listener);
  }
  function addListener2(listener: (message: unknown) => void) {
    listeners2.push(listener);
  }
  return [
    new IPC({ send: send1, addListener: addListener1, defaultTimeoutMs: 1000 }),
    new IPC({ send: send2, addListener: addListener2, defaultTimeoutMs: 1000 }),
  ];
}

describe('ipc', () => {
  it('exports a class', () => {
    expect(new IPC({ send: () => void 0, addListener: () => void 0 })).toBeInstanceOf(IPC);
  });
  it('sends and receive a message', async () => {
    const [ipc1, ipc2] = createTwoWayIpc();
    let messageFromIpc1: unknown = null;
    const awaiter = new Promise<void>((resolve) => {
      const unsubscribe = ipc2.on('foo', (msg) => {
        messageFromIpc1 = msg;
        unsubscribe();
        resolve();
      });
    });
    ipc1.send('foo', 'bar');
    await awaiter;
    expect(messageFromIpc1).toBe('bar');
  });
  it('handles request-response with a sync handler', async () => {
    const [ipc1, ipc2] = createTwoWayIpc();
    ipc2.handleRequest('foo', (echo) => echo);
    const response = await ipc1.request('foo', 'bar');
    expect(response).toBe('bar');
  });
  it('handles multiple request-response when responses are unordered', async () => {
    const [ipc1, ipc2] = createTwoWayIpc();
    ipc2.handleRequest('foo', (echo) => new Promise((resolve) => setTimeout(() => resolve(echo), Math.random() * 50)));
    const messages = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const responses = await Promise.all(messages.map((msg) => ipc1.request('foo', msg)));
    expect(responses).toEqual(messages);
  });
  it('times our when response takes too long', async () => {
    const [ipc1, ipc2] = createTwoWayIpc();
    ipc2.handleRequest('foo', (echo) => new Promise((resolve) => setTimeout(() => resolve(echo), 200)));
    let error = null;
    try {
      await ipc1.request('foo', 'bar', 50);
    } catch (err) {
      error = err;
    }
    expect(error).not.toBeNull();
  });
});
