// ---------------------------------------------------------------------------
// 核心数据类型
// CLI 生成数据、浏览器读取数据，两侧共用同一份定义。
// ---------------------------------------------------------------------------

/** 树形图中的一个矩形，坐标为相对父容器的像素。 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 日历分组：按路径 glob 把仓库切成前端/后端等几部分。 */
export interface GroupDef {
  id: string;
  label: string;
  hue: number;
  sat: number;
  /** 命中任意 glob 即归入该组，多个组时按配置顺序取第一个命中的。 */
  match: string[];
}

/** 行数分类：决定树形图的配色与图例。 */
export interface CategoryDef {
  id: string;
  label: string;
  hue: number;
  sat: number;
  /** 命中任意 glob 即归入该类，缺省表示兜底类。 */
  match?: string[];
  /** 图例默认是否计入，缺省为计入。 */
  defaultOn?: boolean;
}

/** 配置档：一次分析使用的分组、分类与忽略规则。 */
export interface Profile {
  name: string;
  label: string;
  groups: GroupDef[];
  categories: CategoryDef[];
  /** 在 .gitignore 之外额外忽略的路径 glob。 */
  ignore: string[];
}

/** 一个分组（或全部）在某个范围内的改动量。 */
export interface GroupStat {
  commits: number;
  add: number;
  del: number;
}

/** 一次提交及其各分组的改动量。 */
export interface CommitEntry {
  hash: string;
  subject: string;
  groups: Record<string, GroupStat>;
}

/** 某一天的全部提交与各分组合计，groups 里始终含 all 键。 */
export interface DayEntry {
  commits: CommitEntry[];
  groups: Record<string, GroupStat>;
}

/** 改动日历数据（对应浏览器侧的 /api/data.json）。 */
export interface CalendarData {
  generatedAt: string;
  root: string;
  profile: string;
  /** 实际启用的分组，空数组表示不区分前后端。 */
  groups: Array<Pick<GroupDef, 'id' | 'label' | 'hue' | 'sat'>>;
  range: { min: string; max: string };
  totals: { days: number; groups: Record<string, GroupStat> };
  /** 单日改动行峰值，用于日历条宽度刻度。 */
  maxVal: number;
  days: Record<string, DayEntry>;
}

/** 单个文件的行数统计。 */
export interface LocFileEntry {
  path: string;
  lines: number;
  nonBlank: number;
  cat: string;
}

/** 行数清单数据（对应浏览器侧的 /api/loc.json）。 */
export interface LocData {
  generatedAt: string;
  root: string;
  profile: string;
  categories: Array<Pick<CategoryDef, 'id' | 'label' | 'hue' | 'sat' | 'defaultOn'>>;
  totals: { files: number; lines: number; nonBlank: number };
  skipped: { binary: number; large: number };
  files: LocFileEntry[];
}

/** 浏览器侧树形图节点，由 LocData 构建。 */
export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  value: number;
  fileCount: number;
  cat: string;
  catSum: Record<string, number>;
}
