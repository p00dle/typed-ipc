export class IPC<I extends Record<string, unknown>, O extends Record<string, unknown>> {
  private _send: (msg: unknown) => void;
  private listeners = {} as Record<keyof I, ((payload: unknown, requestId: number) => void)[]>;
  private mainListener: (message: unknown) => void;
  private requestId = 0;
  private defaultTimeoutMs = 5000;

  constructor(options: {
    send: (message: unknown) => void;
    addListener: (listener: (message: unknown) => void) => void;
    defaultTimeoutMs?: number;
  }) {
    this._send = options.send;
    this.mainListener = (message) => {
      if (typeof message === 'object' && message !== null && 'channel' in message && 'payload' in message) {
        const channel = message.channel as keyof I;
        const requestId = 'requestId' in message && typeof message.requestId === 'number' ? message.requestId : -1;
        if (Array.isArray(this.listeners[channel])) {
          for (const listener of this.listeners[channel]) {
            listener(message.payload, requestId);
          }
        }
      }
    };
    options.addListener(this.mainListener);
    if (options.defaultTimeoutMs) {
      this.defaultTimeoutMs = options.defaultTimeoutMs;
    }
  }

  public send<C extends keyof O>(channel: C, payload: O[C]): void {
    this._send({ channel, payload });
  }

  public on<C extends keyof I>(channel: C, listener: (payload: I[C]) => void): () => void {
    const untypedListener = listener as (mesasge: unknown) => void;
    if (!Array.isArray(this.listeners[channel])) {
      this.listeners[channel] = [];
    }
    this.listeners[channel].push(untypedListener);
    return () => {
      const index = this.listeners[channel].indexOf(untypedListener);
      if (index >= 0) this.listeners[channel].splice(index, 1);
    };
  }

  public async request<C extends keyof O & keyof I>(channel: C, payload: O[C], timeoutMs = this.defaultTimeoutMs): Promise<I[C]> {
    const requestId = this.requestId++;
    /* v8 ignore next */
    if (this.requestId >= Number.MAX_SAFE_INTEGER) this.requestId = 0;
    if (!Array.isArray(this.listeners[channel])) {
      this.listeners[channel] = [];
    }
    const channelListeners = this.listeners[channel];
    const sendPayload = this._send;
    return new Promise((resolve, reject) => {
      function onSettled() {
        const index = channelListeners.indexOf(onResponse);
        if (index >= 0) channelListeners.splice(index, 1);
        clearTimeout(timeoutHandle);
      }
      const timeoutHandle = setTimeout(() => {
        onSettled();
        reject('Request timed out');
      }, timeoutMs);

      function onResponse(payload: unknown, responseId: number) {
        if (requestId === responseId) {
          onSettled();
          resolve(payload as I[C]);
        }
      }
      channelListeners.push(onResponse);
      sendPayload({ channel, payload, requestId });
    });
  }

  public handleRequest<C extends keyof O & keyof I>(channel: C, handler: (payload: I[C]) => Promise<O[C]> | O[C]) {
    if (!Array.isArray(this.listeners[channel])) {
      this.listeners[channel] = [];
    }
    this.listeners[channel].push(async (payload, requestId) => {
      const handlerOutput = await handler(payload as I[C]);
      this._send({ channel, payload: handlerOutput, requestId });
    });
  }
}
