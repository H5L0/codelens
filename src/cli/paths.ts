// ---------------------------------------------------------------------------
// 包内路径
// 源码运行时是 src/cli/*.ts，构建后是 dist/cli/*.js，上两级都是包根目录。
// ---------------------------------------------------------------------------
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 前端资源目录：开发模式用 Vite 的源码根，其余情况用构建产物。 */
export function webDir(dev: boolean): string {
  return dev ? resolve(packageRoot, 'src/web') : resolve(packageRoot, 'dist', 'web');
}
