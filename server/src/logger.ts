/*
 * Lightweight console logger used across the server runtime.
 */
export const logger = {
  info: (...args: unknown[]) => console.log(new Date().toISOString(), '[INFO]', ...args),
  warn: (...args: unknown[]) => console.warn(new Date().toISOString(), '[WARN]', ...args),
  error: (...args: unknown[]) => console.error(new Date().toISOString(), '[ERROR]', ...args)
};
