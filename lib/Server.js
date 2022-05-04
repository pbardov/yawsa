import WebSocket from 'ws';
import AppError from '@pbardov/app-error';
import Connection from './Connection.js';

export default class Server {
  constructor({ wsOptions = {}, api }) {
    this.#wsOptions = wsOptions;
    this.#api = api;

    const srv = new WebSocket.Server(this.#wsOptions);
    srv.on('connection', (...args) => this.#onConnection(...args));
    srv.on('error', (err) => {
      const error = AppError.wrap(err);
      error.print('wss error');
    });
    this.#srv = srv;
  }

  get srv() {
    return this.#srv;
  }

  get connections() {
    return this.#connections;
  }

  #api = null;

  #srv = null;

  #wsOptions = {};

  #connections = new Set();

  #onConnection(ws, httpMsg) {
    const con = new Connection({ ws, httpMsg });
    con.api = this.#apiFactory(con);
    this.#connections.add(con);
    con.on('close', () => {
      this.#connections.delete(con);
    });
  }

  #apiFactory(con) {
    const api = this.#api;
    if (typeof api === 'function') {
      return api(con);
    }
    return api;
  }
}
