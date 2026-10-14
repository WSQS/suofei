package dev.sopho.suofei.data

/**
 * `contentVersion` 比较（契约 §4）。
 *
 * 契约 v0 写的是「按 ISO 日期前缀＋递增序号的字典序比较，如 2026.10.14.1 → 2026.10.14.2」。
 * 这里对**纯数字点分段**的版本号按段做数值比较：对契约举的例子结果与字典序完全一致，
 * 但对 `2026.10.14.10` vs `2026.10.14.9` 这种序号跨位的情况，数值比较才是对的
 * （纯字典序会把 .10 判成比 .9 旧）。非纯数字的版本号退回字典序。
 * —— 这一点已写进 docs/design/android-offline-update.md，并作为待负责人确认的契约措辞问题上报。
 */
object ContentVersion {

    /** 返回 <0 表示 [a] 比 [b] 旧，0 表示相等，>0 表示 [a] 比 [b] 新。 */
    fun compare(a: String, b: String): Int {
        val sa = a.trim()
        val sb = b.trim()
        if (sa == sb) return 0
        val da = numericSegments(sa)
        val db = numericSegments(sb)
        if (da != null && db != null) {
            val n = maxOf(da.size, db.size)
            for (i in 0 until n) {
                val x = da.getOrElse(i) { 0L }
                val y = db.getOrElse(i) { 0L }
                val c = x.compareTo(y)
                if (c != 0) return c
            }
            // 段数不同但前缀相同：段多的一方更「新」（2026.10.14 < 2026.10.14.0 以外的场景都是后者更细）。
            return da.size.compareTo(db.size)
        }
        return sa.compareTo(sb)
    }

    /** [candidate] 是否严格新于 [current]（[current] 为 null 视为无已装内容，任何候选都算新）。 */
    fun isNewer(candidate: String, current: String?): Boolean {
        if (current == null || current.isBlank()) return true
        return compare(candidate, current) > 0
    }

    private fun numericSegments(v: String): List<Long>? {
        if (v.isEmpty()) return null
        val parts = v.split('.')
        if (parts.any { it.isEmpty() || it.any { c -> !c.isDigit() } }) return null
        return parts.map { part ->
            // 段内过长（>18 位）视为不可数值化，退回字典序，避免溢出误判。
            if (part.length > 18) return null
            part.toLong()
        }
    }
}
