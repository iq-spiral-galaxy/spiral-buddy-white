/**
 * v0.5.76 — 초경량 TTL 캐시.
 *
 * 매 API 요청마다 vault 전체 glob+read, 로드맵 트리 재귀 탐색을 반복하던
 * 핫패스(listSpiralNotes / discoverRoadmaps / loadRoadmapChapters)에 씌움.
 * 노트가 쌓일수록 (스파이럴 학습 특성상 계속 쌓임) 선형으로 느려지던
 * 요청 비용을 TTL 윈도우 안에서 O(1)로.
 *
 * 동시 호출 dedup: 같은 key의 동시 miss는 한 loader만 실행하고 공유
 * (사이드바 로드 시 /roadmaps + /chapters가 거의 동시에 notes를 찾는 패턴).
 */

interface Entry<T> {
  value: T;
  at: number;
}

export interface TtlCache<T> {
  get(key: string, loader: () => Promise<T>): Promise<T>;
  /** key 생략 시 전체 비움 */
  invalidate(key?: string): void;
}

export interface TtlCacheOptions {
  /**
   * loader가 끝나지 않을 때 공유 inflight를 영구 대기시키지 않는 상한.
   * underlying 작업 자체를 중단시키지는 않지만, 늦은 결과는 generation guard로
   * cache에 쓰이지 않는다.
   */
  loadTimeoutMs?: number;
}

export class CacheLoadTimeoutError extends Error {
  readonly key: string;
  readonly timeoutMs: number;

  constructor(key: string, timeoutMs: number) {
    super(`Cache loader timed out after ${timeoutMs}ms (${key})`);
    this.name = "CacheLoadTimeoutError";
    this.key = key;
    this.timeoutMs = timeoutMs;
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  key: string,
  timeoutMs: number | undefined,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new CacheLoadTimeoutError(key, timeoutMs)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function createTtlCache<T>(
  ttlMs: number,
  options: TtlCacheOptions = {},
): TtlCache<T> {
  const entries = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T>>();
  const generations = new Map<string, number>();

  return {
    async get(key: string, loader: () => Promise<T>): Promise<T> {
      const hit = entries.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return hit.value;

      const pending = inflight.get(key);
      if (pending) return pending;

      const generation = generations.get(key) ?? 0;
      let resolvePending!: (value: T) => void;
      let rejectPending!: (error: unknown) => void;
      const p = new Promise<T>((resolve, reject) => {
        resolvePending = resolve;
        rejectPending = reject;
      });
      // loader를 부르기 전에 등록한다. loader가 동기로 throw하거나 즉시 reject해도
      // finally가 삭제할 대상이 이미 존재하므로 inflight가 고착되지 않는다.
      inflight.set(key, p);
      void (async () => {
        try {
          const value = await withTimeout(
            Promise.resolve(loader()),
            key,
            options.loadTimeoutMs,
          );
          // invalidate/timeout 뒤에 도착한 오래된 loader가 새 cache를 덮지 못하게 한다.
          if ((generations.get(key) ?? 0) === generation) {
            entries.set(key, { value, at: Date.now() });
          }
          resolvePending(value);
        } catch (error) {
          rejectPending(error);
        } finally {
          if (inflight.get(key) === p) inflight.delete(key);
        }
      })();
      return p;
    },
    invalidate(key?: string) {
      const invalidateKey = (target: string) => {
        generations.set(target, (generations.get(target) ?? 0) + 1);
        entries.delete(target);
        // 이미 이 Promise를 기다리는 호출자는 결과를 받지만, 다음 get은 새 loader를
        // 시작한다. generation guard가 늦은 결과의 cache write를 차단한다.
        inflight.delete(target);
      };
      if (key === undefined) {
        const keys = new Set([
          ...entries.keys(),
          ...inflight.keys(),
          ...generations.keys(),
        ]);
        for (const target of keys) invalidateKey(target);
      } else {
        invalidateKey(key);
      }
    },
  };
}
