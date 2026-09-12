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
        throw new Error('--exclude 缺少取值');
      }
      args.exclude.push(value);
      continue;
    }
    if (STRING_FLAGS[flag]) {
      const value = inline ?? argv[++i];
      if (value === undefined) {
        throw new Error(`${flag} 缺少取值`);
      }
      (args[STRING_FLAGS[flag]] as string | undefined) = value;
      continue;
    }
    if (NUMBER_FLAGS[flag]) {
      const value = inline ?? argv[++i];
      const num = Number(value);
      if (value === undefined || !Number.isFinite(num) || num < 0) {
        throw new Error(`${flag} 需要一个非负数字，收到：${value ?? '(空)'}`);
      }
      (args[NUMBER_FLAGS[flag]] as number) = num;
      continue;
    }
    if (raw.startsWith('-') && raw !== '-') {
      throw new Error(`未知参数：${raw}（用 --help 查看用法）`);
    }
    if (args.dir !== '') {
      throw new Error(`只接受一个目录参数，多余的是：${raw}`);
    }
    args.dir = raw;
  }

  return args;
}

export function helpText(): string {
  return `codelens：把 git 仓库的改动历史与代码行数可视化成本地看板

用法
  codelens [目录] [选项]

选项
  --profile <名称|文件>  配置档，内置 ${builtinProfileNames().join('、')}，也可指向自定义 json
  --config <文件>        配置文件，默认 <目录>/codelens.config.json
  --days <天数>          改动日历的时间跨度，0 表示全部历史（默认 120）
  --exclude <glob>       额外忽略的路径，可重复
  --port <端口>          监听端口，默认 5178，被占用时向后尝试
  --host <地址>          监听地址，默认 127.0.0.1
  --no-open              不自动打开浏览器
  --no-gitignore         不按 .gitignore 过滤，只跳过内置的重目录
  --dump <目录>          只写出 data.json 与 loc.json 后退出
  --dev                  开发模式，用 Vite 提供热更新
  -h, --help             显示帮助
  -v, --version          显示版本

示例
  npx codelens                      统计当前目录
  npx codelens ../my-repo           统计指定仓库
  npx codelens --profile web        按前后端拆分改动日历
  npx codelens --profile ./p.json   使用自定义配置档文件
`;
}
