package expo.modules.healthconnect.listening

import expo.modules.healthconnect.HubJson
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class KeywordLinesTest {
  private val vocabulary = KeywordLines.vocabularyOf(TOKENS)

  @Test
  fun `the tokens file gives the model vocabulary`() {
    assertEquals(setOf("<blk>", "▁HE", "Y", "▁JA", "R", "VI", "S"), vocabulary)
  }

  @Test
  fun `hub lines load as pieces and a spoken phrase`() {
    val lines = KeywordLines.parse("▁HE Y ▁JA R VI S @hey_jarvis\n\n  ▁HE Y @hey  \n", vocabulary)
    assertEquals(listOf("▁HE", "Y", "▁JA", "R", "VI", "S"), lines[0].pieces)
    assertEquals("hey jarvis", lines[0].phrase)
    assertEquals("hey", lines[1].phrase)
    assertEquals(2, lines.size)
  }

  @Test
  fun `rendering gives the hub's lines back byte for byte`() {
    val text = "▁HE Y ▁JA R VI S @hey_jarvis\n▁HE Y @hey"
    assertEquals(text, KeywordLines.render(KeywordLines.parse(text, vocabulary)))
  }

  @Test
  fun `a line without a label is refused`() {
    assertThrows(ListeningConfigInvalid::class.java) { KeywordLines.parse("▁HE Y", vocabulary) }
    assertThrows(ListeningConfigInvalid::class.java) { KeywordLines.parse(" @label", vocabulary) }
    assertThrows(ListeningConfigInvalid::class.java) { KeywordLines.parse("▁HE Y @two words", vocabulary) }
  }

  @Test
  fun `a piece the model does not know is refused by name`() {
    val failure = assertThrows(ListeningConfigInvalid::class.java) { KeywordLines.parse("▁HE ZZ @hey", vocabulary) }
    assertTrue(failure.message.orEmpty().contains("ZZ"))
  }

  @Test
  fun `a config from the hub carries lines, threshold and transcription`() {
    val config = HubJson.decode<ListeningConfig>(
      """{"type":"listening_config","keywords":"▁HE Y @hey","threshold":0.15,"transcribe":true,"pause_ms":200}"""
    )
    assertEquals(0.15f, config.threshold, 0f)
    assertTrue(config.transcribe)
    assertEquals("hey", config.lines(vocabulary).single().phrase)
  }

  @Test
  fun `a threshold outside zero to one is refused`() {
    assertThrows(ListeningConfigInvalid::class.java) { ListeningConfig("▁HE Y @hey", 0f, false, 200).lines(vocabulary) }
    assertThrows(ListeningConfigInvalid::class.java) { ListeningConfig("▁HE Y @hey", 1.5f, false, 200).lines(vocabulary) }
  }

  @Test
  fun `a config carries the end-of-speech pause`() {
    val config = HubJson.decode<ListeningConfig>(
      """{"keywords":"","threshold":0.15,"transcribe":true,"pause_ms":640}"""
    )
    assertEquals(640, config.pauseMs)
  }

  @Test
  fun `a config without the end-of-speech pause is refused`() {
    assertThrows(SerializationException::class.java) {
      HubJson.decode<ListeningConfig>("""{"keywords":"","threshold":0.15,"transcribe":true}""")
    }
  }

  @Test
  fun `a pause of zero is refused`() {
    assertThrows(ListeningConfigInvalid::class.java) { ListeningConfig("", 0.15f, true, 0).lines(vocabulary) }
  }

  @Test
  fun `no keywords is a valid config with no lines`() {
    assertTrue(ListeningConfig("", 0.15f, false, 200).lines(vocabulary).isEmpty())
  }

  private companion object {
    const val TOKENS = "<blk> 0\n▁HE 49\nY 17\n▁JA 424\nR 24\nVI 168\nS 3\n"
  }
}
