import WebSocket from 'isomorphic-ws';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import AppError from '@pbardov/app-error';
import delay from './delay.js';
import wait4Event from './wait4Event.js';

const PING_TIMEOUT = 15000;
const RPC_TIMEOUT = 20000;
const RESERVED_EVENTS = { wsopen: 'wsopen', wsclose: 'wsclose', wsbroken: 'wsbroken' };

const ST_CONNECTING = 0;
const ST_OPEN = 1;
const ST_CLOSING = 2;
const ST_CLOSED = 3;
const ST_BROKEN = -1;

export default class Client extends EventEmitter {
  static ST_CONNECTING = ST_CONNECTING;

  static ST_OPEN = ST_OPEN;

  static ST_CLOSING = ST_CLOSING;

  static ST_CLOSED = ST_CLOSED;

  static ST_BROKEN = ST_BROKEN;

  timeout = RPC_TIMEOUT;

  pingTimeout = PING_TIMEOUT;

  constructor({ wsParams = [], ...options } = {}) {
    super();

    this.#wsParams = [...wsParams];
    Object.assign(this.#binded, {
      onOpen: (...args) => this.#onOpen(...args),
      onClose: (...args) => this.#onClose(...args),
      onMessage: (...args) => this.#onMessage(...args),
      onBroken: (...args) => this.#onBroken(...args),
      heartbeat: (...args) => this.#heartbeat(...args),
      send: (...args) => this.#send(...args)
    });

    const { timeout = this.timeout, pingTimeout = this.pingTimeout } = options;
    this.timeout = timeout;
    this.pingTimeout = pingTimeout;
  }

  get ws() {
    return this.#ws;
  }

  get state() {
    if (this.#stRestoreBroken) {
      return ST_BROKEN;
    }
    if (!this.#ws) {
      return ST_CLOSED;
    }
    return this.#ws.readyState;
  }

  async waitReady() {
    if (this.state === ST_CLOSED) {
      throw new AppError('WebSocket connection closed');
    }
    if (this.state !== ST_OPEN) {
      await wait4Event(this, 'wsopen');
    }
  }

  open(wsParams) {
    if (wsParams) {
      this.#wsParams = [...wsParams];
    }
    this.close();

    const ws = new WebSocket(...this.#wsParams);
    const { onClose: onclose, onOpen: onopen, onMessage: onmessage } = this.#binded;
    Object.assign(ws, { onclose, onopen, onmessage });

    this.#ws = ws;

    this.#heartbeat();
  }

  close() {
    if (this.#brokenTid) {
      clearTimeout(this.#brokenTid);
      this.#brokenTid = null;
    }
    if (this.#ws) {
      this.#ws.close();
    }
    this.#ws = null;
  }

  async invoke(method, ...params) {
    const msg = {
      id: uuid(),
      method,
      params
    };
    const waitAnswer = this.#waitForAnswer(msg.id);
    await this.waitReady();

    this.#send(msg);

    const answer = await waitAnswer;
    if (answer.error) {
      throw AppError.wrap(answer.error);
    }

    return answer.result;
  }

  #ws = null;

  #wsParams = [];

  #waiters = new Map();

  #stRestoreBroken = false;

  #brokenTid;

  #binded = {};

  #waitForAnswer(id) {
    const promise = new Promise((resolve, reject) => {
      this.#waiters.set(id, { resolve, reject });
    });
    const { timeout } = this;
    return Promise.race([
      promise,
      (async () => {
        await delay(timeout);
        throw new AppError('Timedout', { id, timeout });
      })()
    ]).finally(() => {
      this.#waiters.delete(id);
    });
  }

  #onOpen() {
    this.#stRestoreBroken = false;
    this.emit('wsopen');
  }

  #onClose() {
    this.emit('wsclose');
  }

  #onMessage(wsMsg) {
    this.#heartbeat();
    try {
      const msg = JSON.parse(wsMsg.data);
      if (msg && msg.event) {
        const { event = '', data = {} } = msg;
        if (event) {
          if (RESERVED_EVENTS[event]) {
            console.warn(`Using reserved event name ${event}`);
          } else {
            this.emit(event, data);
          }
        }
      } else if (msg && msg.id) {
        const waiters = this.#waiters;
        if (waiters.has(msg.id)) {
          const { tid, resolve } = waiters.get(msg.id);
          waiters.delete(msg.id);
          clearTimeout(tid);
          resolve(msg);
        }
      }
    } catch (err) {
      const error = AppError.wrap(err);
      error.print('Error when WebSocket message process');
    }
  }

  #onBroken() {
    console.warn('WebSocket client connection broken');
    this.#stRestoreBroken = true;
    this.emit('wsbroken');
    this.open();
  }

  #heartbeat() {
    if (this.#brokenTid) {
      clearTimeout(this.#brokenTid);
      this.#brokenTid = null;
    }
    this.#brokenTid = setTimeout(this.#onBroken, this.pingTimeout);
  }

  #send(data) {
    const json = JSON.stringify(data);
    if (this.#ws) {
      return this.#ws.send(json);
    }
    throw new AppError('Client not connected');
  }
}
