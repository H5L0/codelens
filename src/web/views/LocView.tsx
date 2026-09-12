// ---------------------------------------------------------------------------
// 代码行数视图
// 面积树形图：方块面积正比于行数，颜色代表分类，深浅代表层级。
// 点击方块放大到该目录并铺满画面，面包屑或 Esc 逐级返回；
// 当前视图的直属子目录可以用 Tab 聚焦、回车放大。
// ---------------------------------------------------------------------------
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { CategoryDef, LocData, Rect, TreeNode } from '../../core/types.js';
import { Switch } from '../components/Switch.js';
import { inkFor } from '../lib/color.js';
import { formatNumber as f } from '../lib/format.js';
import { useLabel } from '../lib/i18n.js';
import { ANIM_MS, nextStages } from '../lib/stages.js';
import type { Anim, StageSpec } from '../lib/stages.js';
import { buildTree, visibleChildren } from '../lib/tree.js';
import type { Metric } from '../lib/tree.js';
import { layoutTreemap } from '../lib/treemap.js';
import type { PaintedNode } from '../lib/treemap.js';

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
  level,
  total,
  rootName,
}: {
  painted: PaintedNode;
  meta: ReadonlyMap<string, CategoryDef>;
  /** 相对当前视图根的层级，1 是直属子块。 */
  level: number;
  /** 当前视图根的总行数，用来算占比。 */
  total: number;
  rootName: string;
}) {
  const { t } = useTranslation();
  const { node, rect, depth, headH, open, children } = painted;
  const category = meta.get(node.cat);
  // 文字色按背景亮度挑，保证小字也有 4.5:1 的对比度
  const ink = inkFor(category?.hue ?? 214, category?.sat ?? 58, Math.max(32, 60 - depth * 6));
  const canZoom = level === 1 && node.isDir && visibleChildren(node).length > 0;
  const percent = total > 0 ? ((node.value / total) * 100).toFixed(1) : '0.0';
  const label = node.isDir
    ? t('loc.nodeLabelDir', {
        context: canZoom ? 'zoom' : undefined,
        path: node.path || rootName,
        lines: f(node.value),
        files: t('loc.files', { count: node.fileCount }),
        percent,
      })
    : t('loc.nodeLabel', { path: node.path, lines: f(node.value), percent });
  return (
    <div
      className={`tm-node${node.isDir ? '' : ' is-file'}`}
      data-path={node.path}
      role={canZoom ? 'button' : 'img'}
      tabIndex={canZoom ? 0 : -1}
      aria-label={label}
      style={cssVars({
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.w}px`,
        height: `${rect.h}px`,
        '--c': ink.bg,
        '--fg': ink.fg,
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
            <NodeEl key={child.node.path} painted={child} meta={meta} level={level + 1} total={total} rootName={rootName} />
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
  total,
  rootName,
}: {
  spec: StageSpec;
  leaving: boolean;
  meta: ReadonlyMap<string, CategoryDef>;
  total: number;
  rootName: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  // 每个舞台只展开一次：尺寸或内容变化会重建 spec，按 spec 跑就会反复重放动画
  const animated = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    const wrap = el?.parentElement;
    if (!el || !wrap || !spec.anim || animated.current === spec.id || prefersReducedMotion()) {
      return;
    }
    const target = spec.anim.kind === 'in' ? spec.anim.rect : rectOfPath(el, wrap, spec.anim.focusPath);
    const box = wrap.getBoundingClientRect();
    if (!target || target.w <= 0 || target.h <= 0 || box.width <= 0 || box.height <= 0) {
      return;
    }
    animated.current = spec.id;
    const sx = target.w / box.width;
    const sy = target.h / box.height;
    el.classList.add('entering');
    el.style.transformOrigin = '0 0';
    // 起始状态把整块舞台摆成被点击方块的大小与位置，动画就是它展开铺满画面
    el.style.transform = `translate(${target.x}px, ${target.y}px) scale(${sx}, ${sy})`;
    el.style.opacity = '0';
    /** 过渡结束后清掉行内样式，舞台回到自然状态，后续重排不会带着旧变换。 */
    const settle = (): void => {
      el.classList.remove('entering');
      el.style.transformOrigin = '';
      el.style.transform = '';
      el.style.opacity = '';
    };
    // 等两帧再改写目标样式，确保浏览器先记录起始状态再触发过渡
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translate(0px, 0px) scale(1, 1)';
      });
    });
    const timer = setTimeout(settle, ANIM_MS + 80);
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      clearTimeout(timer);
      settle();
    };
  }, [spec]);

  return (
    <div className={`tm-stage${leaving ? ' leaving' : ''}`} ref={ref}>
      {spec.empty ? (
        <div className="tm-empty">{t('loc.empty')}</div>
      ) : (
        spec.painted.map((painted) => (
          <NodeEl key={painted.node.path} painted={painted} meta={meta} level={1} total={total} rootName={rootName} />
        ))
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

interface LocViewProps {
  data: LocData | undefined;
  error: string | undefined;
  /** 数据加载失败后的重试。 */
  onRetry: () => void;
  hidden: boolean;
}

export function LocView({ data, error, onRetry, hidden }: LocViewProps) {
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

  // 换了一级视图后，旧的悬浮信息（数值与面包屑预告）已经对不上眼前的方块
  useEffect(() => {
    setHover(undefined);
    hotRef.current?.classList.remove('hot');
    hotRef.current = null;
  }, [viewRoot?.path]);

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
  const measureRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const measure = (): void => {
      const next = { w: el.clientWidth, h: el.clientHeight };
      setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    };
    measureRef.current = measure;
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

  // 视图重新显示时补测一次：后台标签页里帧循环被节流，ResizeObserver 可能迟迟不回调，
  // 只靠观察器会让树形图一直是空的
  useLayoutEffect(() => {
    if (!hidden) {
      measureRef.current();
    }
  }, [hidden]);

  // 重绘：缩放追加一个带过渡的新舞台，其余变化就地替换当前舞台内容
  useEffect(() => {
    const anim = pendingAnim.current;
    pendingAnim.current = undefined;
    setStages((prev) => nextStages(prev, { id: (stageId.current += 1), painted, empty, anim }));
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

  /** 鼠标点击与键盘回车走同一条放大路径。 */
  const zoomInto = (el: HTMLElement): void => {
    const node = tree?.index.get(el.dataset.path ?? '');
    const wrap = wrapRef.current;
    if (!wrap || !node || !node.isDir || visibleChildren(node).length === 0) {
      return;
    }
    zoomTo(node.path, { kind: 'in', rect: rectOf(el, wrap) });
  };

  const onStageClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('.tm-node');
    if (el) {
      zoomInto(el);
    }
  };

  const onStageKey = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const el = (event.target as HTMLElement).closest<HTMLElement>('.tm-node');
    if (el) {
      event.preventDefault();
      zoomInto(el);
    }
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

  // 图例顺序固定按未筛选前的总行数排：切换分类开关或统计口径都不会挪动位置
  const legendCategories = useMemo(() => {
    const lines = (id: string): number => catStats.get(id)?.lines ?? 0;
    return [...categories].sort((a, b) => lines(b.id) - lines(a.id));
  }, [categories, catStats]);

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
  // 悬浮可放大的目录时，在面包屑尾部预告它的相对路径：灰色，表示点下去会到这里
  const hoverPreview = (() => {
    if (!hover || !viewRoot || !hover.isDir || hover.path === viewRoot.path || visibleChildren(hover).length === 0) {
      return '';
    }
    const base = viewRoot.path;
    return base && hover.path.startsWith(`${base}/`) ? hover.path.slice(base.length + 1) : hover.path;
  })();

  return (
    <section hidden={hidden}>
      <div hidden={error !== undefined}>
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
            {hoverPreview ? (
              <>
                <span className="crumb-sep">/</span>
                <span className="crumb preview">{hoverPreview}</span>
              </>
            ) : null}
            <span className="crumbs-meta">
              {t('loc.crumbsMeta', { lines: f(viewRoot?.value ?? 0), percent: scopeShare.toFixed(1) })}
            </span>
          </div>
          <div
            className="tm-wrap"
            ref={wrapRef}
            role="group"
            aria-label={t('loc.treeLabel')}
            onClick={onStageClick}
            onKeyDown={onStageKey}
            onMouseOver={onStageOver}
            onMouseLeave={onStageLeave}
          >
            {stages.map((spec, i) => (
              <Stage
                key={spec.id}
                spec={spec}
                leaving={i < stages.length - 1}
                meta={meta}
                total={viewRoot?.value ?? 0}
                rootName={data?.root ?? ''}
              />
            ))}
          </div>
          <div className="tm-legend">
            {legendCategories.map((category) => {
              const on = active.get(category.id) ?? true;
              const stat = catStats.get(category.id) ?? { lines: 0, nonBlank: 0, files: 0 };
              return (
                <button
                  key={category.id}
                  type="button"
                  data-cat={category.id}
                  className={`lg${on ? '' : ' off'}`}
                  style={cssVars({ '--c': `hsl(${category.hue} ${category.sat}% 48%)` })}
                  title={on ? t('loc.legendOn') : t('loc.legendOff')}
                  aria-pressed={on}
                  onClick={() => setToggled((prev) => ({ ...prev, [category.id]: !on }))}
                >
                  <span className="sq" aria-hidden="true" />
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
        <button type="button" onClick={onRetry}>
          {t('loadRetry')}
        </button>
      </div>
    </section>
  );
}
