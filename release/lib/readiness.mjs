// 「这次产物到底能不能推进」的**唯一**判据：结论文字与退出码必须由同一个决定产生。
//
// 为什么单独拎出来（2026-10-19，起因是接到 job 级的两次 run 需要靠退出码分流）：
//   原先 check-ready 的两个「不满足推进条件」分支**只打印、不改退出码**（最后统一 `process.exit(0)`）⇒
//   只要不是 `FAIL` 而是 `WARN`（没跑）/`SKIP`（没查），工作流就会**照样**进到 Pages / Release 那几步，
//   等于「结论写着不推进、流水线照样发布」。这与本项目点名的反模式（看起来有保障、其实没有）是同一类问题。
//   现在：**没有 PASS 就不算绿**这条判据落在一个纯函数里，打印与退出码都读它，并且有单测钉住四种情形。

/**
 * @param {{sameAppRefresh: boolean, variant: string|null,
 *          notGreen: readonly (string|{id: string})[], sameAppNotGreen: readonly (string|{id: string})[]}} opts
 * @returns {{ready: boolean, exitCode: 0|1, kind: 'same-app-ready'|'same-app-not-ready'|'release-ready'|'release-not-ready'|'rehearsal-debug', blockers: string[]}}
 */
export function decideReadiness({ sameAppRefresh, variant, notGreen, sameAppNotGreen }) {
  const ids = (xs) => (xs ?? []).map((x) => (typeof x === 'string' ? x : x.id));
  // ⚠️ **debug 变体先判**（2026-10-19 修）：debug 签名不可能通过 apk-signing 门，所以 debug 构建
  //    在**任何模式**下都不能被读成「可发布」—— 它只能得到演练口径（exit 0，但 ready=false）。
  //    同 app 模式尤其危险：它的结论句写着「可以按新 tag 建 Release」，用在 debug 构建上就是谎话。
  if (variant === 'debug') {
    return { ready: false, exitCode: 0, kind: 'rehearsal-debug', blockers: ids([...(notGreen ?? []), ...(sameAppNotGreen ?? [])]) };
  }
  if (sameAppRefresh) {
    const blockers = ids(sameAppNotGreen);
    return blockers.length === 0
      ? { ready: true, exitCode: 0, kind: 'same-app-ready', blockers: [] }
      : { ready: false, exitCode: 1, kind: 'same-app-not-ready', blockers };
  }
  const blockers = ids(notGreen);
  return blockers.length === 0
    ? { ready: true, exitCode: 0, kind: 'release-ready', blockers: [] }
    : { ready: false, exitCode: 1, kind: 'release-not-ready', blockers };
}
