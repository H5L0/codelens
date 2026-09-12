// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

/** 取仓库目录名，用作看板标题。 */
export function repoName(root: string): string {
  const parts = root.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? root;
}
