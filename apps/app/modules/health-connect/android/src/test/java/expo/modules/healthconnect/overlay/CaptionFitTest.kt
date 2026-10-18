package expo.modules.healthconnect.overlay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptionFitTest {
  private val measure: (CharSequence) -> Float = { it.length * UNIT }

  @Test
  fun `a caption that fits is kept whole and is not trimmed`() {
    val line = CaptionFit.tail("Turn the lights on", 200f, measure)
    assertEquals("Turn the lights on", line.text)
    assertFalse(line.trimmed)
    assertEquals(180f, line.width, 0f)
  }

  @Test
  fun `a long caption keeps its newest words and fills the room`() {
    val text = "one two three four five six seven eight nine ten"
    val line = CaptionFit.tail(text, 125f, measure)
    assertTrue(line.trimmed)
    assertTrue(text.endsWith(line.text))
    assertEquals(12, line.text.length)
    assertTrue(line.width <= 125f)
  }

  @Test
  fun `one very long word never leaves the room`() {
    val line = CaptionFit.tail("x".repeat(5000), 100f, measure)
    assertEquals(10, line.text.length)
    assertTrue(line.trimmed)
  }

  @Test
  fun `a caption of tens of thousands of characters still ends with the last character`() {
    val text = (1..20_000).joinToString("") { (it % 10).toString() }
    val line = CaptionFit.tail(text, 300f, measure)
    assertEquals(30, line.text.length)
    assertTrue(text.endsWith(line.text))
  }

  @Test
  fun `an emoji is never split between its two code units`() {
    val emoji = String(Character.toChars(EMOJI))
    val line = CaptionFit.tail("ab" + emoji.repeat(6), 35f, measure)
    assertEquals(emoji, line.text)
    assertTrue(line.width <= 35f)
  }

  @Test
  fun `a letter and its combining mark stay together`() {
    val accented = "e" + COMBINING_ACUTE.toChar()
    val line = CaptionFit.tail("xxxxx" + accented.repeat(3), 55f, measure)
    assertEquals(accented.repeat(2), line.text)
  }

  @Test
  fun `Thai text is cut between characters and keeps the end`() {
    val text = "ช่วยเปิดไฟห้องนั่งเล่นให้หน่อย ครัว"
    val line = CaptionFit.tail(text, 120f, measure)
    assertTrue(text.endsWith(line.text))
    assertTrue(line.trimmed)
    assertFalse(line.text.firstOrNull()?.let { Character.getType(it) == Character.NON_SPACING_MARK.toInt() } ?: false)
  }

  @Test
  fun `no room or no text gives an empty trimmed line`() {
    assertEquals("", CaptionFit.tail("hello", 0f, measure).text)
    assertTrue(CaptionFit.tail("hello", -4f, measure).trimmed)
    assertFalse(CaptionFit.tail("", 50f, measure).trimmed)
  }

  private companion object {
    const val UNIT = 10f
    const val EMOJI = 0x1F600
    const val COMBINING_ACUTE = 0x0301
  }
}
