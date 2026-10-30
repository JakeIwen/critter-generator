// Error text shown to users or saved in traces never carries API keys or bearer tokens.
export const safeError = error => String(error?.message || error)
  .replace(/\bsk-[\w-]+/g, '[redacted]').replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]').slice(0, 900);
