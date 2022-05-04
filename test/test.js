/* global describe, it */
/* eslint-disable no-await-in-loop */
import process from 'process';
import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import assert from 'assert';
import { Client, Server } from '../index.js';
import delay from '../lib/delay.js';

process.env.DEBUG = true;

chai.use(chaiAsPromised);

const WS_PORT = 8581;

class Api extends EventEmitter {
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
    const msg = 'Error message';
    try {
      await cl.invoke('throwException', msg);
    } catch (err) {
      errMsg = err.message;
    }
    assert.strictEqual(errMsg, msg, `Wrong answer ${errMsg}`);
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
