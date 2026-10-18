package expo.modules.healthconnect.overlay

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

class OverlayTokensTest {
  private val css = File("../../../global.css").readText()
  private val dark = block("@variant dark {", "@variant light {")
  private val light = block("@variant light {", "@layer base")

  @Test
  fun `the dark palette equals the app tokens`() {
    assertPalette(OverlayTokens.dark, dark, 0xF0)
  }

  @Test
  fun `the light palette equals the app tokens`() {
    assertPalette(OverlayTokens.light, light, 0xF0)
  }

  @Test
  fun `the glow colours are the app teal, amber and coral`() {
    assertEquals(colour(dark, "viz-1"), OverlayTokens.GLOW_TEAL)
    assertEquals(colour(dark, "primary"), OverlayTokens.GLOW_AMBER)
    assertEquals(colour(dark, "viz-4"), OverlayTokens.GLOW_CORAL)
  }

  @Test
  fun `the pill is the raised surface at its design opacity`() {
    assertEquals(0xF0, OverlayTokens.PILL_ALPHA)
    assertEquals(0xF0, (OverlayTokens.dark.pill ushr 24) and 0xFF)
    assertEquals(0xF0, (OverlayTokens.light.pill ushr 24) and 0xFF)
  }

  private fun assertPalette(palette: OverlayPalette, tokens: Map<String, String>, pillAlpha: Int) {
    assertEquals("solid", colour(tokens, "surface-raised"), palette.solid)
    assertEquals("pill", (pillAlpha shl 24) or (colour(tokens, "surface-raised") and 0xFFFFFF), palette.pill)
    assertEquals("on-surface", colour(tokens, "on-surface"), palette.onSurface)
    assertEquals("variant", colour(tokens, "on-surface-variant"), palette.variant)
    assertEquals("faint", colour(tokens, "on-surface-faint"), palette.faint)
    assertEquals("outline", colour(tokens, "outline"), palette.outline)
    assertEquals("primary", colour(tokens, "primary"), palette.primary)
    assertEquals("on-primary", colour(tokens, "on-primary"), palette.onPrimary)
    assertEquals("orb-shine", colour(tokens, "orb-shine"), palette.shine)
    assertEquals("primary-container", colour(tokens, "primary-container"), palette.primaryContainer)
    assertEquals("on-primary-container", colour(tokens, "on-primary-container"), palette.onPrimaryContainer)
    assertEquals("surface-2", colour(tokens, "surface-2"), palette.surface2)
    assertEquals("surface-3", colour(tokens, "surface-3"), palette.surface3)
    assertEquals("critical", colour(tokens, "critical"), palette.critical)
    assertEquals("viz-1", colour(tokens, "viz-1"), palette.viz1)
    assertEquals("viz-4", colour(tokens, "viz-4"), palette.viz4)
  }

  private fun block(from: String, to: String): Map<String, String> {
    val start = css.indexOf(from)
    val end = css.indexOf(to, start + from.length)
    check(start >= 0 && end > start) { "$from not found in global.css" }
    return Regex("--color-([a-z0-9-]+):\\s*([^;]+);").findAll(css.substring(start, end))
      .associate { it.groupValues[1] to it.groupValues[2].trim() }
  }

  private fun colour(tokens: Map<String, String>, name: String): Int {
    val value = tokens.getValue(name)
    if (value.startsWith("#")) return 0xFF000000.toInt() or value.substring(1).toLong(16).toInt()
    val parts = value.removePrefix("rgba(").removeSuffix(")").split(",").map { it.trim() }
    val alpha = Math.round(parts[3].toDouble() * 255).toInt()
    return (alpha shl 24) or (parts[0].toInt() shl 16) or (parts[1].toInt() shl 8) or parts[2].toInt()
  }
}
