const WebSocket = require('isomorphic-ws');
const EventEmitter = require('events');
const uuid = require('uuid/v4');
const { bindProto } = require('./helpers');

const privateData = new WeakMap();
const pd = privateData.get.bind(privateData);

const PING_TIMEOUT = 15000;
const RPC_TIMEOUT = 20000;
const RESERVED_EVENTS = { wsopen: 'wsopen', wsclose: 'wsclose', wsbroken: 'wsbroken' };

const ST_CONNECTING = 0;
const ST_OPEN = 1;
const ST_CLOSING = 2;
const ST_CLOSED = 3;
const ST_BROKEN = -1;

const privateProto = {
  waitForAnswer(id) {
    return new Promise((resolve) => {
      const tid = setTimeout(() => {
        pd(this).waiters.delete(id);
        resolve({ id, error: 'Timed out' });
      }, this.timeout);
      pd(this).waiters.set(id, { resolve, tid });
    });
  },

  onOpen() {
    pd(this).stRestoreBroken = false;
    this.emit('wsopen');
  },

  onClose() {
    this.emit('wsclose');
  },

  onMessage(wsMsg) {
    pd(this).heartbeat();
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
        const { waiters } = pd(this);
        if (waiters.has(msg.id)) {
          const { tid, resolve } = waiters.get(msg.id);
          waiters.delete(msg.id);
          clearTimeout(tid);
          resolve(msg);
        }
      }
    } catch (err) {
      console.error(`Error when WebSocket message process: ${err}`);
    }
  },

  onBroken() {
    console.warn('WebSocket client connection broken');
    pd(this).stRestoreBroken = true;
    this.emit('wsbroken');
    this.open();
  },

  heartbeat() {
    if (pd(this).brokenTid) {
      clearTimeout(pd(this).brokenTid);
      pd(this).brokenTid = null;
    }
    pd(this).brokenTid = setTimeout(pd(this).onBroken, PING_TIMEOUT);
  },

  send(data) {
    const { ws } = pd(this);
    const json = JSON.stringify(data);
    if (ws) {
      return ws.send(json);
    }
    throw new Error('Client not connected');
  }
};

class Client extends EventEmitter {
  static get ST_CONNECTING() {
    return ST_CONNECTING;
  }

  static get ST_OPEN() {
    return ST_OPEN;
  }

  static get ST_CLOSING() {
    return ST_CLOSING;
  }

  static get ST_CLOSED() {
    return ST_CLOSED;
  }

  static get ST_BROKEN() {
    return ST_BROKEN;
  }

  constructor({ wsParams = [], timeout = RPC_TIMEOUT, pingTimeout = PING_TIMEOUT }) {
    super();

    const privMethods = bindProto(this, privateProto);
    privateData.set(this, {
      wsParams: [...wsParams],
      stRestoreBroken: false,
      waiters: new Map(),
      ...privMethods
    });

    this.timeout = timeout;
    this.pingTimeout = pingTimeout;
  }

  get ws() {
    return pd(this).ws;
  }

  get state() {
    const { stRestoreBroken, ws } = pd(this);
    if (stRestoreBroken) {
      return ST_BROKEN;
    }
    if (!ws) {
      return ST_CLOSED;
    }
    return ws.readyState;
  }

  waitReady() {
    return new Promise((resolve, reject) => {
      if (this.state === ST_OPEN) {
        resolve();
        return;
      }
      if (this.state === ST_CLOSED) {
        reject(new Error('WebSocket connection closed'));
        return;
      }
      // connection in connecting or broken state
      this.once('wsopen', () => resolve());
    });
  }

  open(wsParams) {
    if (wsParams) {
      pd(this).wsParams = [...wsParams];
    }
    this.close();

    const ws = new WebSocket(...pd(this).wsParams);
    ws.onclose = pd(this).onClose;
    ws.onopen = pd(this).onOpen;
    ws.onmessage = pd(this).onMessage;

    pd(this).ws = ws;

    pd(this).heartbeat();
  }

  close() {
    if (pd(this).brokenTid) {
      clearTimeout(pd(this).brokenTid);
      pd(this).brokenTid = null;
    }
    const { ws } = pd(this);
    if (ws) {
      ws.close();
    }
    pd(this).ws = null;
  }

  async invoke(method, ...params) {
    const msg = {
      id: uuid(),
      method,
      params
    };

    pd(this).send(msg);

    const answer = await pd(this).waitForAnswer(msg.id);
    if (answer.error) {
      throw new Error(answer.error);
    }

    return answer.result;
  }
}

module.exports = Client;
