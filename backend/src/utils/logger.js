const levels = ['debug', 'info', 'warn', 'error'];

function log(level, message, meta) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (meta !== undefined) {
    console.log(prefix, message, meta);
  } else {
    console.log(prefix, message);
  }
}

export const logger = Object.fromEntries(
  levels.map((level) => [
    level,
    (message, meta) => {
      if (process.env.NODE_ENV === 'test' && level !== 'error') return;
      log(level, message, meta);
    },
  ]),
);