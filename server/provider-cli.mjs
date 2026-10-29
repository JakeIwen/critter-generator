import { accessSync, constants } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ENVIRONMENT_NAMES = ['HOME', 'USER', 'LOGNAME', 'PATH', 'LANG', 'LC_ALL', 'SHELL'];

export function claudeEnvironment(source = process.env) {
  return { ...Object.fromEntries(ENVIRONMENT_NAMES.filter(key => source[key] !== undefined).map(key => [key, source[key]])),
    CLAUDE_AGENT_SDK_CLIENT_APP: 'critter-generator/1.0' };
}

function executable(file) {
  try { accessSync(file, constants.X_OK); return file; } catch { return undefined; }
}

export function resolveClaudeExecutable() {
  // An explicit path never falls back: isolated checks can prohibit the real CLI.
  if (process.env.CRITTER_CLAUDE_EXECUTABLE) return executable(process.env.CRITTER_CLAUDE_EXECUTABLE);
  const base = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
  const musl = process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime;
  for (const name of musl ? [`${base}-musl`, base] : [base]) {
    try { const file = executable(require.resolve(`${name}/claude`)); if (file) return file; } catch { /* Try PATH. */ }
  }
  return (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
    .map(directory => executable(path.join(directory, 'claude'))).find(Boolean);
}

export function claudeOptions(cwd, resolveExecutable = resolveClaudeExecutable) {
  const executable = resolveExecutable();
  if (!executable) throw new Error('Claude CLI is unavailable on this host. Install the bundled SDK binary and sign in with a Claude subscription.');
  return { cwd, env: claudeEnvironment(), pathToClaudeCodeExecutable: executable,
    settingSources: [], strictMcpConfig: true, skills: [], verbatimPrompts: true, tools: [],
    persistSession: false, permissionMode: 'dontAsk',
    extraArgs: { restricted: null, 'disable-slash-commands': null } };
}
