// ---------------------------------------------------------------------------
// 数据读取
// 页面启动时向 CLI 的接口取两份数据，失败时把错误交给调用方展示并可重试。
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react';

interface FetchState<T> {
  data: T | undefined;
  error: string | undefined;
  /** 重新拉取一次数据。 */
  reload: () => void;
}

interface Loaded<T> {
  data: T | undefined;
  error: string | undefined;
}

export function useJson<T>(url: string): FetchState<T> {
  const [state, setState] = useState<Loaded<T>>({ data: undefined, error: undefined });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ data: undefined, error: undefined });
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
        console.error(`failed to load ${url}`, err);
        setState({ data: undefined, error: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, [url, attempt]);

  const reload = useCallback(() => setAttempt((prev) => prev + 1), []);
  return { ...state, reload };
}
