package dev.sopho.suofei.ui

import dev.sopho.suofei.update.FailureKind

/**
 * 「关于」页（原「更新页」改名）里「状态」那一行的文案。
 *
 * 抽成**纯函数**有两个原因：
 * 1. 可以 JVM 单测逐状态断言「文案非空」（`UpdateStatusTextTest`）—— 模拟器验收曾报「状态行渲染为空」，
 *    我查不出成因（见报告），但至少能让「每种状态的文案都非空且可读」成为可检查的事实；
 * 2. 文案不再散落在 Composable 里，改一处就是改一处。
 *
 * 末行还有一层兜底：万一将来某个状态带了空字符串进来，也**不显示空行**，而是给一句如实的话。
 */
fun updateStatusText(status: UpdateStatus): String {
    val text = when (status) {
        is UpdateStatus.Idle -> "尚未检查。"
        is UpdateStatus.Checking -> "正在检查…"
        is UpdateStatus.UpToDate -> "已是最新内容（远端 ${status.remoteVersion}）。"
        is UpdateStatus.Activated ->
            "新内容 ${status.version} 已下载、校验通过并已切换生效（${status.bytes} 字节）；返回目录后采用。"

        is UpdateStatus.Failed -> "更新未生效，旧内容保留：${status.reason}" + failureHint(status.kind)
        is UpdateStatus.Error -> status.message
    }
    return text.ifBlank { "（状态未知：这次检查没有留下可显示的原因，请再试一次）" }
}

/** 失败分类的补充说明；没有补充的返回空串（拼在原因后面，不影响非空）。 */
fun failureHint(kind: FailureKind): String = when (kind) {
    FailureKind.FORMAT_TOO_NEW, FailureKind.APP_TOO_OLD -> "（需更新应用，内容不会被动）"
    FailureKind.CHECKSUM_MISMATCH, FailureKind.SIZE_MISMATCH -> "（下载/校验未通过）"
    else -> ""
}
