package dev.sopho.suofei

import dev.sopho.suofei.ui.UpdateStatus
import dev.sopho.suofei.ui.failureHint
import dev.sopho.suofei.ui.updateStatusText
import dev.sopho.suofei.update.FailureKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 更新页「状态」那一行的文案门。
 *
 * 背景：模拟器验收记录里写着「状态行渲染为空（原始 UI XML：`状态` → `''` → 按钮），而代码里六个
 * 状态分支都有非空文案 ⇒ 未查清」。查不清成因也不能让它悬着 —— 于是把文案抽成纯函数
 * （`updateStatusText`）并加这道门：**每个状态都必须给出非空、可读的一行**。
 *
 * 状态集合的完整性由编译器保证：`updateStatusText` 里的 `when` 覆盖 `UpdateStatus` 的每个子类，
 * 漏一个就编译不过（这里再把它们逐一跑一遍值）。
 */
class UpdateStatusTextTest {

    /** 六个状态（新增子类时 `when` 会先编译失败，提醒补这里）。 */
    private val everyStatus = listOf(
        UpdateStatus.Idle,
        UpdateStatus.Checking,
        UpdateStatus.UpToDate("2026.10.16.5"),
        UpdateStatus.Activated("2026.10.16.5", 23899L),
        UpdateStatus.Failed(FailureKind.NETWORK, "取更新清单失败：UnknownHostException"),
        UpdateStatus.Error("载入状态异常"),
    )

    @Test
    fun everyStatusHasNonBlankText() {
        for (status in everyStatus) {
            val text = updateStatusText(status)
            assertTrue("状态 $status 的文案不该为空", text.isNotBlank())
        }
    }

    @Test
    fun textIsHumanReadablePerState() {
        assertTrue(updateStatusText(UpdateStatus.Idle).contains("尚未检查"))
        assertTrue(updateStatusText(UpdateStatus.Checking).contains("正在检查"))
        assertTrue(updateStatusText(UpdateStatus.UpToDate("2026.10.16.5")).contains("2026.10.16.5"))
        assertTrue(updateStatusText(UpdateStatus.Activated("2026.10.16.5", 23899L)).contains("23899"))
        assertTrue(updateStatusText(UpdateStatus.Error("载入状态异常")).contains("载入状态异常"))
    }

    @Test
    fun failedAlwaysSaysOldContentKept_andCarriesTheReason() {
        val text = updateStatusText(
            UpdateStatus.Failed(FailureKind.CHECKSUM_MISMATCH, "SHA-256 不符（清单 a，实际 b）"),
        )
        assertTrue("失败文案必须说清旧内容还在：$text", text.contains("旧内容保留"))
        assertTrue("失败原因要能看见：$text", text.contains("SHA-256 不符"))
        assertTrue("校验类失败要有补充说明：$text", text.contains("下载/校验未通过"))
    }

    @Test
    fun everyFailureKindProducesNonBlankText() {
        for (kind in FailureKind.entries) {
            val text = updateStatusText(UpdateStatus.Failed(kind, "原因"))
            assertTrue("失败类型 $kind 的文案不该为空", text.isNotBlank())
        }
    }

    @Test
    fun blankMessageCannotProduceAnEmptyRow() {
        // 兜底：万一某个状态带了空字符串进来，也不许渲染成空行
        val fallback = updateStatusText(UpdateStatus.Error(""))
        assertTrue("空 message 也必须给出非空文案", fallback.isNotBlank())
        assertEquals(
            "同一个兜底文案（空 message 与纯空白 message 应一致）",
            fallback,
            updateStatusText(UpdateStatus.Error("   ")),
        )
        // 失败原因为空时，前缀本身仍然可读（非空）
        val blankReason = updateStatusText(UpdateStatus.Failed(FailureKind.IO, ""))
        assertTrue("空原因也必须非空", blankReason.isNotBlank())
        assertTrue("空原因时仍应说清未生效", blankReason.contains("更新未生效"))
    }

    @Test
    fun hintsExistOnlyForKindsThatHaveSomethingToAdd() {
        assertTrue(failureHint(FailureKind.FORMAT_TOO_NEW).isNotEmpty())
        assertTrue(failureHint(FailureKind.APP_TOO_OLD).isNotEmpty())
        assertTrue(failureHint(FailureKind.SIZE_MISMATCH).isNotEmpty())
        assertTrue(failureHint(FailureKind.CHECKSUM_MISMATCH).isNotEmpty())
        // 其余类型没有补充说明（空串）；但不能因此让整行变空——前缀已保证非空
        assertEquals("", failureHint(FailureKind.NETWORK))
        assertFalse(updateStatusText(UpdateStatus.Failed(FailureKind.NETWORK, "x")).isBlank())
    }
}
