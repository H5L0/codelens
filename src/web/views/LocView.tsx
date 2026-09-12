// ---------------------------------------------------------------------------
// 代码行数视图
// 面积树形图：方块面积正比于行数，颜色代表分类，深浅代表层级。
// 点击方块放大到该目录并铺满画面，面包屑或 Esc 逐级返回。
// ---------------------------------------------------------------------------
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { CategoryDef, LocData, Rect, TreeNode } from '../../core/types.js';
import { Switch } from '../components/Switch.js';
import { formatNumber as f } from '../lib/format.js';
import { useLabel } from '../lib/i18n.js';
import { buildTree, visibleChildren } from '../lib/tree.js';
import type { Metric } from '../lib/tree.js';
import { layoutTreemap } from '../lib/treemap.js';
import type { PaintedNode } from '../lib/treemap.js';

const ANIM_MS = 300;

type Anim = { kind: 'in'; rect: Rect } | { kind: 'out'; focusPath: string };

interface StageSpec {
  id: number;
  painted: PaintedNode[];
  empty: boolean;
  anim: Anim | undefined;
}

/** 把 CSS 变量塞进 style 需要绕过类型限制。 */
const cssVars = (vars: Record<string, string>): CSSProperties => vars as CSSProperties;

const prefersReducedMotion = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

function rectOf(el: HTMLElement, wrap: HTMLElement): Rect {
  const box = el.getBoundingClientRect();
  const base = wrap.getBoundingClientRect();
  return { x: box.left - base.left, y: box.top - base.top, w: box.width, h: box.height };
}

// ---------------------------------------------------------------------------
// 方块
// ---------------------------------------------------------------------------

const NodeEl = memo(function NodeEl({
  painted,
  meta,
}: {
  painted: PaintedNode;
  meta: ReadonlyMap<string, CategoryDef>;
}) {
  const { t } = useTranslation();
  const { node, rect, depth, headH, open, children } = painted;
  const category = meta.get(node.cat);
  const light = Math.max(32, 60 - depth * 6);
  return (
    <div
      className={`tm-node${node.isDir ? '' : ' is-file'}`}
      data-path={node.path}
      style={cssVars({
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.w}px`,
        height: `${rect.h}px`,
        '--c': `hsl(${category?.hue ?? 214} ${category?.sat ?? 58}% ${light}%)`,
        '--fg': light >= 52 ? '#0d1b26' : '#ffffff',
      })}
    >
      {headH > 0 ? (
        <div className="tm-head">
          <span className="tm-name">{node.name}</span>
          {rect.w >= 78 ? <span className="tm-val">{f(node.value)}</span> : null}
        </div>
      ) : null}
      {open ? (
        <div className="tm-body" style={{ top: `${headH}px` }}>
          {children.map((child) => (
            <NodeEl key={child.node.path} painted={child} meta={meta} />
          ))}
        </div>
      ) : node.isDir && rect.w >= 64 && rect.h >= 34 ? (
        <div className="tm-badge">{t('loc.files', { count: node.fileCount })}</div>
      ) : null}
    </div>
  );
});

// ---------------------------------------------------------------------------
// 舞台
// 每次重绘产生一个舞台；放大时旧舞台淡出，新舞台从被点击方块的位置展开。
// ---------------------------------------------------------------------------

const Stage = memo(function Stage({
  spec,
  leaving,
  meta,
}: {
  spec: StageSpec;
  leaving: boolean;
  meta: ReadonlyMap<string, CategoryDef>;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const wrap = el?.parentElement;
    if (!el || !wrap || !spec.anim || prefersReducedMotion()) {
      return;
    }
    const target = spec.anim.kind === 'in' ? spec.anim.rect : rectOfPath(el, wrap, spec.anim.focusPath);
    if (!target || target.w <= 0 || target.h <= 0) {
      return;
    }
    const box = wrap.getBoundingClientRect();
    const sx = target.w / box.width;
    const sy = target.h / box.height;
    el.classList.add('entering');
    el.style.transformOrigin = '0 0';
    el.style.transform = `translate(${-target.x * sx}px, ${-target.y * sy}px) scale(${sx}, ${sy})`;
    el.style.opacity = '0';
    // 等两帧再改写目标样式，确保浏览器先记录起始状态再触发过渡
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translate(0px, 0px) scale(1, 1)';
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [spec]);

  return (
    <div className={`tm-stage${leaving ? ' leaving' : ''}`} ref={ref}>
      {spec.empty ? (
        <div className="tm-empty">{t('loc.empty')}</div>
      ) : (
        spec.painted.map((painted) => <NodeEl key={painted.node.path} painted={painted} meta={meta} />)
      )}
    </div>
  );
});

function rectOfPath(stage: HTMLElement, wrap: HTMLElement, path: string): Rect | undefined {
  for (const el of stage.querySelectorAll<HTMLElement>('.tm-node')) {
    if (el.dataset.path === path) {
      return rectOf(el, wrap);
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 视图
// ---------------------------------------------------------------------------

export interface LocViewProps {
  data: LocData | undefined;
  error: string | undefined;
  hidden: boolean;
}

export function LocView({ data, error, hidden }: LocViewProps) {
  const { t } = useTranslation();
  const label = useLabel();
  const [metric, setMetric] = useState<Metric>('lines');
  const [depthLevels, setDepthLevels] = useState<1 | 2>(2);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [zoomPath, setZoomPath] = useState('');
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [stages, setStages] = useState<StageSpec[]>([]);
  const [hover, setHover] = useState<TreeNode | undefined>(undefined);

  const wrapRef = useRef<HTMLDivElement>(null);
  const hotRef = useRef<HTMLElement | null>(null);
  const stageId = useRef(0);
  const pendingAnim = useRef<Anim | undefined>(undefined);

  const categories = data?.categories ?? [];
  const meta = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  // 分类是否计入：没有显式切换过就用配置里的默认值
  const active = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const category of categories) {
      map.set(category.id, toggled[category.id] ?? category.defaultOn !== false);
    }
    return map;
  }, [categories, toggled]);

  const filtered = useMemo(
    () => (data ? data.files.filter((file) => (active.get(file.cat) ?? true) && file[metric] > 0) : []),
    [data, active, metric],
  );

  const tree = useMemo(
    () =>
      data
        ? buildTree(filtered, metric, data.root, categories[categories.length - 1]?.id ?? 'app')
        : undefined,
    [data, filtered, metric, categories],
  );

  const catStats = useMemo(() => {
    const map = new Map<string, { lines: number; nonBlank: number; files: number }>();
    for (const file of data?.files ?? []) {
      const stat = map.get(file.cat) ?? { lines: 0, nonBlank: 0, files: 0 };
      stat.lines += file.lines;
      stat.nonBlank += file.nonBlank;
      stat.files += 1;
      map.set(file.cat, stat);
    }
    return map;
  }, [data]);

  // 放大目标可能因开关变化而不复存在，回退到仓库根
  const viewRoot = useMemo(() => {
    if (!tree) {
      return undefined;
    }
    const node = zoomPath ? tree.index.get(zoomPath) : tree.root;
    return node && node.isDir && node.value > 0 ? node : tree.root;
  }, [tree, zoomPath]);

  useEffect(() => {
    if (!tree || !zoomPath) {
      return;
    }
    const node = tree.index.get(zoomPath);
    if (!node || !node.isDir || node.value <= 0) {
      setZoomPath('');
    }
  }, [tree, zoomPath]);

  // 默认展开当前根的直接子目录，展开层级由「显示层级」开关控制
  const expanded = useMemo(() => {
    const set = new Set<string>();
    if (!viewRoot) {
      return set;
    }
    set.add(viewRoot.path);
    if (depthLevels >= 2) {
      for (const child of viewRoot.children) {
        if (child.isDir) {
          set.add(child.path);
        }
      }
    }
    return set;
  }, [viewRoot, depthLevels]);

  const painted = useMemo(
    () => (viewRoot && size.w > 0 && size.h > 0 ? layoutTreemap(viewRoot, { w: size.w, h: size.h, expanded }) : []),
    [viewRoot, expanded, size],
  );
  const empty = !viewRoot || viewRoot.value <= 0;

  // 尺寸变化时重新布局：视图被隐藏时宽高为 0，切回来由观察器纠正
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const measure = (): void => {
      const next = { w: el.clientWidth, h: el.clientHeight };
      setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    };
    measure();
    // 老环境没有 ResizeObserver 时退回监听窗口尺寸
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 重绘：缩放追加一个带过渡的新舞台，其余变化就地替换当前舞台内容
  useEffect(() => {
    const anim = pendingAnim.current;
    pendingAnim.current = undefined;
    setStages((prev) => {
      if (anim) {
        return [...prev, { id: (stageId.current += 1), painted, empty, anim }];
      }
      if (prev.length === 0) {
        return [{ id: (stageId.current += 1), painted, empty, anim: undefined }];
      }
      const last = prev[prev.length - 1];
      if (last.painted === painted && last.empty === empty) {
        return prev;
      }
      return [...prev.slice(0, -1), { ...last, painted, empty }];
    });
  }, [painted, empty]);

  // 过渡结束后只留最新舞台
  useEffect(() => {
    if (stages.length <= 1) {
      return;
    }
    const timer = setTimeout(() => setStages((prev) => prev.slice(-1)), ANIM_MS + 80);
    return () => clearTimeout(timer);
  }, [stages]);

  const zoomTo = (path: string, anim: Anim): void => {
    if (path === zoomPath) {
      return;
    }
    pendingAnim.current = anim;
    setZoomPath(path);
  };

  const zoomUp = (): void => {
    if (!viewRoot || viewRoot.path === '') {
      return;
    }
    const parent = viewRoot.path.includes('/') ? viewRoot.path.slice(0, viewRoot.path.lastIndexOf('/')) : '';
    zoomTo(parent, { kind: 'out', focusPath: viewRoot.path });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        zoomUp();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onStageClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('.tm-node');
    const node = el && tree ? tree.index.get(el.dataset.path ?? '') : undefined;
    const wrap = wrapRef.current;
    if (!el || !wrap || !node || !node.isDir || visibleChildren(node).length === 0) {
      return;
    }
    zoomTo(node.path, { kind: 'in', rect: rectOf(el, wrap) });
  };

  const onStageOver = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('.tm-node');
    if (el === hotRef.current) {
      return;
    }
    hotRef.current?.classList.remove('hot');
    hotRef.current = el;
    const node = el && tree ? tree.index.get(el.dataset.path ?? '') : undefined;
    if (el && node) {
      el.classList.add('hot');
      setHover(node);
      return;
    }
    setHover(undefined);
  };

  const onStageLeave = (): void => {
    hotRef.current?.classList.remove('hot');
    hotRef.current = null;
    setHover(undefined);
  };

  const totalLines = data?.totals[metric] ?? 0;
  const rootValue = tree?.root.value ?? 0;
  const rootFiles = tree?.root.fileCount ?? 0;
  const covered = totalLines > 0 ? (rootValue / totalLines) * 100 : 0;
  const scopeShare = viewRoot && rootValue > 0 ? (viewRoot.value / rootValue) * 100 : 0;
  const crumbs = [{ name: data?.root ?? '', path: '' }];
  if (viewRoot?.path) {
    let acc = '';
    for (const part of viewRoot.path.split('/')) {
      acc = acc ? `${acc}/${part}` : part;
      crumbs.push({ name: part, path: acc });
    }
  }
  const hoverMeta = (() => {
    if (!hover || !viewRoot) {
      return '';
    }
    const share = viewRoot.value > 0 ? (hover.value / viewRoot.value) * 100 : 0;
    const category = meta.get(hover.cat);
    const scope = hover.isDir ? t('loc.files', { count: hover.fileCount }) : category ? label(category) : '';
    return t('loc.statusMeta', {
      context: scope ? 'scope' : undefined,
      lines: f(hover.value),
      percent: share.toFixed(1),
      scope,
    });
  })();

  return (
    <section hidden={hidden}>
      <div>
        <div className="loc-bar">
          <div className="loc-summary">
            <Trans
              i18nKey="loc.summary"
              values={{
                lines: f(rootValue),
                total: f(totalLines),
                files: f(rootFiles),
                allFiles: f(data?.totals.files ?? 0),
                percent: `${covered.toFixed(1)}%`,
              }}
              components={{ b: <b />, total: <span className="total" /> }}
            />
          </div>
          <div className="loc-switches">
            <Switch
              checked={metric === 'nonBlank'}
              title={t('loc.blankTitle')}
              onChange={(on) => setMetric(on ? 'nonBlank' : 'lines')}
            >
              {t('loc.blank')}
            </Switch>
            <Switch
              checked={depthLevels === 2}
              title={t('loc.depthTitle')}
              onChange={(on) => setDepthLevels(on ? 2 : 1)}
            >
              {`${t('loc.depthLabel')} `}
              <span className="depth-value">{t('loc.levels', { count: depthLevels })}</span>
            </Switch>
          </div>
        </div>

        <div className="card tm-card">
          <div className="tm-crumbs">
            {crumbs.map((crumb, i) => (
              <Fragment key={crumb.path}>
                {i > 0 ? <span className="crumb-sep">/</span> : null}
                {i === crumbs.length - 1 ? (
                  <span className="crumb current">{crumb.name}</span>
                ) : (
                  <button
                    type="button"
                    className="crumb"
                    title={t('loc.zoomTo', { path: crumb.path || data?.root })}
                    onClick={() => zoomTo(crumb.path, { kind: 'out', focusPath: viewRoot?.path ?? '' })}
                  >
                    {crumb.name}
                  </button>
                )}
              </Fragment>
            ))}
            <span className="crumbs-meta">
              {t('loc.crumbsMeta', { lines: f(viewRoot?.value ?? 0), percent: scopeShare.toFixed(1) })}
            </span>
          </div>
          <div className="tm-status">
            <span className="path">{hover ? hover.path || data?.root : t('loc.hint')}</span>
            <span className="meta">{hoverMeta}</span>
          </div>
          <div
            className="tm-wrap"
            ref={wrapRef}
            onClick={onStageClick}
            onMouseOver={onStageOver}
            onMouseLeave={onStageLeave}
          >
            {stages.map((spec, i) => (
              <Stage key={spec.id} spec={spec} leaving={i < stages.length - 1} meta={meta} />
            ))}
          </div>
          <div className="tm-legend">
            {categories.map((category) => {
              const on = active.get(category.id) ?? true;
              const stat = catStats.get(category.id) ?? { lines: 0, nonBlank: 0, files: 0 };
              return (
                <button
                  key={category.id}
                  type="button"
                  className={`lg${on ? '' : ' off'}`}
                  style={cssVars({ '--c': `hsl(${category.hue} ${category.sat}% 48%)` })}
                  title={on ? t('loc.legendOn') : t('loc.legendOff')}
                  onClick={() => setToggled((prev) => ({ ...prev, [category.id]: !on }))}
                >
                  <span className="sq" />
                  <span className="lg-name">{label(category)}</span>
                  <span className="lg-val">{t('loc.legendValue', { lines: f(stat[metric]), count: stat.files })}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="load-error" hidden={error === undefined}>
        <Trans i18nKey="loc.loadError" values={{ error: error ?? '' }} components={{ code: <code /> }} />
      </div>
    </section>
  );
}
