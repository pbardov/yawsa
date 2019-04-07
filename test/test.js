/* global describe, it */
/* eslint-disable no-await-in-loop */
const process = require('process');
const uuid = require('uuid/v4');
const events = require('events');

process.env.DEBUG = true;

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const assert = require('assert');

chai.use(chaiAsPromised);

const { Client, Server } = require('../index');
const { delay } = require('../lib/helpers');

const WS_PORT = 8581;

class Api extends events.EventEmitter {
  constructor() {
    super();

    this.cnt = 0;
  }

  hello() {
    this.cnt += 1;
    return `Hello! ${this.cnt}`;
  }

  echo(msg) {
    return `msg: ${msg}`;
  }

  throwException(msg) {
    throw new Error(msg);
  }
}

describe('Test yawsa client server communication', function testMain() {
  this.timeout(10000);

  function apiFactory(con) {
    console.log(`\nHEADERS: ${JSON.stringify(con.headers, null, '   ')}`);
    console.log(`\nRAW HEADERS: ${JSON.stringify(con.rawHeaders, null, '   ')}`);
    return new Api();
  }

  let srv; // eslint-disable-line
  it('Create server', () => {
    srv = new Server({ wsOptions: { port: WS_PORT }, api: apiFactory });
  });

  let cl;
  it('Create client', () => {
    cl = new Client({ wsParams: [`ws://localhost:${WS_PORT}/`, 'sample-protocol-usage'] });
  });

  it('Wait client ready', async () => {
    cl.open();
    await cl.waitReady();
  });

  it('Test hello 1', async () => {
    const hello = await cl.invoke('hello');

    assert(hello, 'Hello must not be empty');
    console.log(hello);
  });

  it('Test hello 2', async () => {
    const hello = await cl.invoke('hello');

    assert(hello, 'Hello must not be empty');
    console.log(hello);
  });

  it('Test hello 3', async () => {
    const hello = await cl.invoke('hello');

    assert(hello, 'Hello must not be empty');
    console.log(hello);
  });

  it('Test echo', async () => {
    const snd = [];
    const w = [];
    for (let n = 0; n < 10; n += 1) {
      const m = uuid();
      snd.push(m);
      w.push(cl.invoke('echo', m));
    }

    const res = await Promise.all(w);
    for (let n = 0; n < res.length; n += 1) {
      assert(res[n] === `msg: ${snd[n]}`, `Wrong answer ${res[n]} != ${snd[n]}`);
    }
  });

  it('Test exception', async () => {
    let errMsg;
    try {
      await cl.invoke('throwException', 'Error message');
    } catch (err) {
      errMsg = err.message;
    }
    assert(errMsg !== 'Error message', `Wrong answer ${errMsg}`);
  });

  it('Test events', async () => {
    let rcvMsg;
    cl.on('testEvent', (msg) => {
      rcvMsg = msg;
    });

    srv.connections.forEach((con) => {
      con.api.emit('wsevent', { event: 'testEvent', data: 'Event message' });
    });

    await delay(500);
    assert(rcvMsg === 'Event message', `Wrong answer ${rcvMsg}`);
    console.log(`Msg: ${rcvMsg}`);
  });
});
