import { EventEmitter } from 'events';
import AppError from '@pbardov/app-error';

const PING_TIMEOUT = 1000;

export default class Connection extends EventEmitter {
  constructor({
    ws, httpMsg = {}, api = null, timeout = PING_TIMEOUT
  }) {
    super();

    this.timeout = timeout;

    const headers = { ...httpMsg.headers };
    const rawHeaders = [...httpMsg.rawHeaders];
    const { socket = false, socket: { authorized = false } = {} } = httpMsg;

    let peerCertificate = false;
    if (socket && typeof socket.getPeerCertificate === 'function') {
      peerCertificate = socket.getPeerCertificate(true);
    }

    this.#ws = ws;
    this.#headers = headers;
    this.#rawHeaders = rawHeaders;
    this.#authorized = authorized;
    this.#peerCertificate = peerCertificate;
    Object.assign(this.#binded, {
      onMessage: (...args) => this.#onMessage(...args),
      onClose: (...args) => this.#onClose(...args),
      onEvent: (...args) => this.#onEvent(...args),
      heartbeat: (...args) => this.#heartbeat(...args)
    });

    const { onMessage, onClose, heartbeat } = this.#binded;
    ws.on('message', onMessage);
    ws.on('close', onClose);

    this.#tid = setInterval(heartbeat, this.timeout);

    this.api = api;
  }

  get ws() {
    return this.#ws;
  }

  get headers() {
    return this.#headers;
  }

  get rawHeaders() {
    return this.#rawHeaders;
  }

  get authorized() {
    return this.#authorized;
  }

  get peerCertificate() {
    return this.#peerCertificate;
  }

  get api() {
    return this.#api;
  }

  set api(api) {
    const { onEvent } = this.#binded;
    if (this.#api && this.#api !== api && this.#api.removeListener) {
      this.#api.removeListener('wsevent', onEvent);
      this.#api = null;
    }
    this.#api = api;
    if (this.#api && this.#api.on) {
      this.#api.on('wsevent', onEvent);
    }
  }

  send(data) {
    const json = JSON.stringify(data);
    try {
      this.#ws.send(json);
    } catch (err) {
      //
    }
  }

  #api = null;

  #ws = null;

  #tid = null;

  #headers = {};

  #rawHeaders = [];

  #authorized = false;

  #peerCertificate = false;

  #lastActive = Date.now();

  #binded = {};

  async #onMessage(raw) {
    const answer = { id: -1 };
    const api = this.#api || {};

    try {
      const msg = JSON.parse(raw);
      const { id, method, params = [] } = msg;
      answer.id = id;

      if (typeof api === 'function') {
        answer.result = await api(method, ...params);
      } else if (api[method] && typeof api[method] === 'function') {
        answer.result = await api[method](...params);
      } else {
        throw new AppError('Unknown method', { method });
      }
    } catch (err) {
      answer.error = AppError.wrap(err);
    }
    this.send(answer);
  }

  #onClose() {
    if (this.#tid) {
      clearInterval(this.#tid);
      this.#tid = null;
    }
    this.emit('close');
  }

  #onEvent(evt) {
    const { event = '', data = {} } = evt;
    this.send({ event, data });
  }

  #heartbeat() {
    this.send({ ping: Date.now() });
  }
}
