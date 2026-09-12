// ---------------------------------------------------------------------------
// 包内路径
// 源码运行时是 src/cli/*.ts，构建后是 dist/cli/*.js，上两级都是包根目录。
// ---------------------------------------------------------------------------
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 前端资源目录：构建产物所在位置。 */
export function webDir(): string {
  return resolve(packageRoot, 'dist', 'web');
}
