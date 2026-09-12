// ---------------------------------------------------------------------------
// 目录树构建
// 把扁平的文件清单汇总成目录树，每个节点带上行数、文件数与分类占比。
// ---------------------------------------------------------------------------
import type { LocFileEntry, TreeNode } from '../../core/types.js';

export type Metric = 'lines' | 'nonBlank';

interface Tree {
  root: TreeNode;
  /** 路径到节点的索引，点方块放大时按路径查找。 */
  index: Map<string, TreeNode>;
}

function emptyDir(name: string, path: string): TreeNode {
  return { name, path, isDir: true, children: [], value: 0, fileCount: 0, cat: '', catSum: {} };
}

export function buildTree(
  files: readonly LocFileEntry[],
  metric: Metric,
  rootName: string,
  fallbackCat: string,
): Tree {
  const root = emptyDir(rootName, '');
  const index = new Map<string, TreeNode>([['', root]]);

  for (const file of files) {
    const parts = file.path.split('/');
    let node = root;
    let acc = '';
    for (let i = 0; i < parts.length - 1; i += 1) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      let child = index.get(acc);
      if (!child) {
        child = emptyDir(parts[i], acc);
        index.set(acc, child);
        node.children.push(child);
      }
      node = child;
    }
    const leaf: TreeNode = {
      name: parts[parts.length - 1],
      path: file.path,
      isDir: false,
      children: [],
      value: file[metric],
      fileCount: 1,
      cat: file.cat,
      catSum: { [file.cat]: file[metric] },
    };
    node.children.push(leaf);
    // 文件也要进索引：鼠标移到方块上时要按路径取回节点
    index.set(file.path, leaf);
  }

  // 自底向上汇总，并按行数从大到小排序，布局算法依赖这个顺序
  const summarize = (node: TreeNode): void => {
    if (!node.isDir) {
      return;
    }
    node.catSum = {};
    node.value = 0;
    node.fileCount = 0;
    for (const child of node.children) {
      summarize(child);
      node.value += child.value;
      node.fileCount += child.fileCount;
      for (const [cat, value] of Object.entries(child.catSum)) {
        node.catSum[cat] = (node.catSum[cat] ?? 0) + value;
      }
    }
    let dominantCat = fallbackCat;
    let dominantValue = -1;
    for (const [cat, value] of Object.entries(node.catSum)) {
      if (value > dominantValue) {
        dominantCat = cat;
        dominantValue = value;
      }
    }
    node.cat = dominantCat;
    node.children.sort((a, b) => b.value - a.value);
  };
  summarize(root);

  return { root, index };
}

/** 当前筛选下仍有行数的子节点。 */
export function visibleChildren(node: TreeNode): TreeNode[] {
  return node.children.filter((child) => child.value > 0);
}
