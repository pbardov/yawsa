const WebSocket = require('ws');
const { bindProto } = require('./helpers');
const Connection = require('./Connection');

const privateData = new WeakMap();
const pd = privateData.get.bind(privateData);

const privateProto = {
  onConnection(ws, httpMsg) {
    const { connections } = pd(this);
    const con = new Connection({ ws, httpMsg });
    con.api = pd(this).apiFactory(con);
    connections.add(con);
    con.on('close', () => {
      connections.delete(con);
    });
  },

  apiFactory(con) {
    const { api } = pd(this);
    if (typeof api === 'function') {
      return api(con);
    }
    return api;
  }
};

class Server {
  constructor({ wsOptions = {}, api }) {
    const privMethods = bindProto(this, privateProto);
    privateData.set(this, {
      wsOptions,
      api,
      srv: null,
      connections: new Set(),
      ...privMethods
    });

    const srv = new WebSocket.Server(pd(this).wsOptions);
    srv.on('connection', pd(this).onConnection);
    srv.on('error', (err) => {
      console.error('wss error: ', err);
    });
    pd(this).srv = srv;
  }

  get srv() {
    return pd(this).srv;
  }

  get connections() {
    return pd(this).connections;
  }
}

module.exports = Server;
