import AppError from '@pbardov/app-error';

export default (emitter, eventName) => new Promise((resolve, reject) => {
  try {
    emitter.once(eventName, resolve);
  } catch (error) {
    reject(AppError.wrap(error));
  }
});
