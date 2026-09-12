// ---------------------------------------------------------------------------
// 命令行参数
// ---------------------------------------------------------------------------
import { builtinProfileNames } from '../core/profile.js';

export interface Args {
  dir: string;
  profile: string;
  config: string | undefined;
  days: number;
  exclude: string[];
  port: number;
  host: string;
  open: boolean;
  useGitignore: boolean;
  dump: string | undefined;
  dev: boolean;
  help: boolean;
  version: boolean;
}

const STRING_FLAGS: Record<string, keyof Args> = {
  '--profile': 'profile',
  '--config': 'config',
  '--dump': 'dump',
  '--host': 'host',
};

const NUMBER_FLAGS: Record<string, keyof Args> = {
  '--days': 'days',
  '--port': 'port',
};

const BOOL_FLAGS: Record<string, [keyof Args, boolean]> = {
  '--dev': ['dev', true],
  '--open': ['open', true],
  '--no-open': ['open', false],
  '--gitignore': ['useGitignore', true],
  '--no-gitignore': ['useGitignore', false],
  '-h': ['help', true],
  '--help': ['help', true],
  '-v': ['version', true],
  '--version': ['version', true],
};

export function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    dir: '',
    profile: 'all',
    config: undefined,
    days: 120,
    exclude: [],
    port: Number(process.env.PORT ?? 5178),
    host: '127.0.0.1',
    open: true,
    useGitignore: true,
    dump: undefined,
    dev: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    const eq = raw.indexOf('=');
    const flag = eq > 0 ? raw.slice(0, eq) : raw;
    const inline = eq > 0 ? raw.slice(eq + 1) : undefined;

    if (BOOL_FLAGS[flag]) {
      const [key, value] = BOOL_FLAGS[flag];
      (args[key] as boolean) = inline === undefined ? value : inline !== 'false';
      continue;
    }
    if (flag === '--exclude') {
      const value = inline ?? argv[++i];
      if (value === undefined) {
        throw new Error('--exclude requires a value');
      }
      args.exclude.push(value);
      continue;
    }
    if (STRING_FLAGS[flag]) {
      const value = inline ?? argv[++i];
      if (value === undefined) {
        throw new Error(`${flag} requires a value`);
      }
      (args[STRING_FLAGS[flag]] as string | undefined) = value;
      continue;
    }
    if (NUMBER_FLAGS[flag]) {
      const value = inline ?? argv[++i];
      const num = Number(value);
      if (value === undefined || !Number.isFinite(num) || num < 0) {
        throw new Error(`${flag} requires a non-negative number, got: ${value ?? '(empty)'}`);
      }
      (args[NUMBER_FLAGS[flag]] as number) = num;
      continue;
    }
    if (raw.startsWith('-') && raw !== '-') {
      throw new Error(`unknown option: ${raw} (see --help)`);
    }
    if (args.dir !== '') {
      throw new Error(`only one directory argument is accepted, extra: ${raw}`);
    }
    args.dir = raw;
  }

  return args;
}

/** 选项与说明分两列对齐，英文说明统一从第 25 列开始。 */
const FLAG_COL = 23;
/** 示例比选项长，用更宽的一列。 */
const EXAMPLE_COL = 35;

const row = (left: string, text: string, width = FLAG_COL): string => `  ${left.padEnd(width)}${text}`;

export function helpText(): string {
  return `codelens: visualize a git repository's change history and lines of code in a local dashboard

Usage
  codelens [directory] [options]

Options
${row('--profile <name|file>', `Profile: built in ${builtinProfileNames().join(', ')}, or a custom json file`)}
${row('--config <file>', 'Config file, defaults to <directory>/codelens.config.json')}
${row('--days <days>', 'Calendar span, 0 for full history (default 120)')}
${row('--exclude <glob>', 'Extra ignored paths, repeatable')}
${row('--port <port>', 'Listen port, default 5178, tries the next ports when busy')}
${row('--host <address>', 'Listen address, default 127.0.0.1')}
${row('--no-open', 'Do not open the browser automatically')}
${row('--no-gitignore', 'Ignore .gitignore; only built-in heavy directories are skipped')}
${row('--dump <dir>', 'Write data.json and loc.json to <dir>, then exit')}
${row('--dev', 'Dev mode with Vite hot reload')}
${row('-h, --help', 'Show help')}
${row('-v, --version', 'Show version')}

Examples
${row('npx codelens', 'analyze the current directory', EXAMPLE_COL)}
${row('npx codelens ../my-repo', 'analyze another repository', EXAMPLE_COL)}
${row('npx codelens --profile web', 'split the calendar into frontend / backend', EXAMPLE_COL)}
${row('npx codelens --profile ./p.json', 'use a custom profile file', EXAMPLE_COL)}`;
}
