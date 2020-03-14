const EventEmitter = require('events');
const { bindProto } = require('./helpers');

const PING_TIMEOUT = 1000;

const privateData = new WeakMap();
const pd = privateData.get.bind(privateData);

const privateProto = {
  async onMessage(raw) {
    const { api = {} } = pd(this);
    const answer = { id: -1 };

    try {
      const msg = JSON.parse(raw);
      const { id, method, params = [] } = msg;
      answer.id = id;

      if (typeof api === 'function') {
        answer.result = await api(method, ...params);
      } else if (api[method] && typeof api[method] === 'function') {
        answer.result = await api[method](...params);
      } else {
        throw new Error(`Unknown method ${method}`);
      }
    } catch (err) {
      answer.error = `${err}`;
    }
    this.send(answer);
  },

  onClose() {
    if (pd(this).tid) {
      clearInterval(pd(this).tid);
      pd(this).tid = null;
    }
    this.emit('close');
  },

  onEvent(evt) {
    const { event = '', data = {} } = evt;
    this.send({ event, data });
  },

  heartbeat() {
    this.send({ ping: Date.now() });
  }
};

class Connection extends EventEmitter {
  constructor({
    ws, httpMsg = {}, api = null, timeout = PING_TIMEOUT
  }) {
    super();

    this.timeout = timeout;

    const headers = { ...httpMsg.headers };
    const rawHeaders = [...httpMsg.rawHeaders];
    const { socket = false, socket: { authorized = false } = {} } = httpMsg;
    const privMethods = bindProto(this, privateProto);

    let peerCertificate = false;
    if (socket && typeof socket.getPeerCertificate === 'function') {
      peerCertificate = socket.getPeerCertificate(true);
    }

    privateData.set(this, {
      ws,
      tid: null,
      api: null,
      headers,
      rawHeaders,
      authorized,
      peerCertificate,
      lastActive: Date.now(),
      ...privMethods
    });

    ws.on('message', pd(this).onMessage);
    ws.on('close', pd(this).onClose);

    pd(this).tid = setInterval(pd(this).heartbeat, this.timeout);

    this.api = api;
  }

  get ws() {
    return pd(this).ws;
  }

  get headers() {
    return pd(this).headers;
  }

  get rawHeaders() {
    return pd(this).rawHeaders;
  }

  get authorized() {
    return pd(this).authorized;
  }

  get peerCertificate() {
    return pd(this).peerCertificate;
  }

  get api() {
    return pd(this).api;
  }

  set api(api) {
    if (pd(this).api && pd(this).api.removeListener) {
      pd(this).api.removeListener('wsevent', pd(this).onEvent);
      pd(this).api = null;
    }
    pd(this).api = api;
    if (pd(this).api && pd(this).api.on) {
      pd(this).api.on('wsevent', pd(this).onEvent);
    }
  }

  send(data) {
    const { ws } = pd(this);
    const json = JSON.stringify(data);
    try {
      ws.send(json);
    } catch (err) {
      //
    }
  }
}

module.exports = Connection;
