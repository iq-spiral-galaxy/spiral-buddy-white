/**
 * Promise 작업을 제한된 동시성으로 실행한다.
 *
 * 파일이 많은 iCloud/네트워크 드라이브에서 직렬 I/O는 매우 느리고,
 * 무제한 Promise.all은 file descriptor 고갈과 I/O 폭주를 일으킬 수 있다.
 * 입력 순서는 결과 배열에 그대로 보존한다.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const workerCount = Math.max(
    1,
    Math.min(items.length, Math.floor(concurrency) || 1),
  );
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let stopped = false;

  async function worker(): Promise<void> {
    while (!stopped) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = await mapper(items[index]!, index);
      } catch (error) {
        // 이미 실행 중인 I/O는 강제로 취소할 수 없지만, 첫 오류 뒤 아직 시작하지
        // 않은 항목까지 계속 스케줄해 timeout/retry와 겹치는 일은 막는다.
        stopped = true;
        throw error;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
