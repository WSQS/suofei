package dev.sopho.suofei

import dev.sopho.suofei.data.ContentVersion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ContentVersionTest {

    @Test
    fun contractExample_incrementsAreNewer() {
        assertTrue(ContentVersion.isNewer("2026.10.14.2", "2026.10.14.1"))
        assertFalse(ContentVersion.isNewer("2026.10.14.1", "2026.10.14.2"))
        assertFalse(ContentVersion.isNewer("2026.10.14.1", "2026.10.14.1"))
    }

    @Test
    fun multiDigitSequenceNumber_comparesNumerically() {
        // 纯字典序会把 .10 判成比 .9 旧，这里必须是 .10 更新。
        assertTrue(ContentVersion.isNewer("2026.10.14.10", "2026.10.14.9"))
        assertTrue(ContentVersion.compare("2026.10.14.9", "2026.10.14.10") < 0)
    }

    @Test
    fun datePrefixDominates() {
        assertTrue(ContentVersion.isNewer("2026.10.15.1", "2026.10.14.99"))
        assertTrue(ContentVersion.isNewer("2027.1.1.1", "2026.12.31.9"))
    }

    @Test
    fun nullCurrentMeansAnythingIsNewer() {
        assertTrue(ContentVersion.isNewer("2026.10.14.1", null))
        assertTrue(ContentVersion.isNewer("2026.10.14.1", "  "))
    }

    @Test
    fun nonNumericFallsBackToLexicographic() {
        assertEquals(0, ContentVersion.compare("draft-a", "draft-a"))
        assertTrue(ContentVersion.compare("draft-b", "draft-a") > 0)
    }
}
