// ---------------------------------------------------------------------------
// 数据读取
// 页面启动时向 CLI 的接口取两份数据，失败时把错误交给调用方展示。
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';

export interface FetchState<T> {
  data: T | undefined;
  error: string | undefined;
}

export function useJson<T>(url: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ data: undefined, error: undefined });

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json() as Promise<T>;
      })
      .then((data) => setState({ data, error: undefined }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        console.error(`读取 ${url} 失败`, err);
        setState({ data: undefined, error: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, [url]);

  return state;
}
