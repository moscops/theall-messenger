export const logger = {
  info: (...args: unknown[]): void => console.log('[info]', ...args),
  error: (...args: unknown[]): void => console.error('[error]', ...args)
};
