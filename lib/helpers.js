const _ = require('lodash');

module.exports = {
  bindProto(that, proto) {
    const nproto = {};
    _.each(proto, (func, name) => {
      nproto[name] = func.bind(that);
    });
    return nproto;
  },

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  asyncCall(fn, ...args) {
    return new Promise((resolve, reject) => {
      let fnRes;
      const cb = (err, ...result) => {
        if (err) {
          reject(err);
        } else {
          resolve([fnRes, ...result]);
        }
      };

      const margs = [...args, cb];
      fnRes = fn(...margs);
    });
  }
};
