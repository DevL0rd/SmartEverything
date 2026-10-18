package expo.modules.healthconnect.listening

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

class ListeningConfigInvalid(reason: String) : IllegalArgumentException("listening config: $reason")

data class KeywordLine(val pieces: List<String>, val label: String) {
  val phrase: String get() = label.replace('_', ' ')

  fun text(): String = "${pieces.joinToString(" ")} @$label"
}

object KeywordLines {
  fun parse(text: String, vocabulary: Set<String>): List<KeywordLine> =
    text.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.map { line(it, vocabulary) }.toList()

  fun render(lines: List<KeywordLine>): String = lines.joinToString("\n") { it.text() }

  fun vocabularyOf(tokens: String): Set<String> =
    tokens.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.map { it.substringBeforeLast(' ') }.toSet()

  private fun line(text: String, vocabulary: Set<String>): KeywordLine {
    val at = text.lastIndexOf(" @")
    if (at <= 0) {
      throw ListeningConfigInvalid("keyword line has no \" @label\": $text")
    }
    val pieces = text.substring(0, at).split(' ').filter { it.isNotEmpty() }
    val label = text.substring(at + 2)
    if (pieces.isEmpty() || label.isEmpty() || label.any { it.isWhitespace() }) {
      throw ListeningConfigInvalid("keyword line is malformed: $text")
    }
    pieces.firstOrNull { it !in vocabulary }?.let { throw ListeningConfigInvalid("model has no token \"$it\" for: $text") }
    return KeywordLine(pieces, label)
  }
}

@Serializable
data class ListeningConfig(
  val keywords: String,
  val threshold: Float,
  val transcribe: Boolean,
  @SerialName("pause_ms") val pauseMs: Int,
  val wake: Boolean = true,
  @SerialName("power_mode") val powerMode: PowerMode = PowerMode.Always
) {
  fun lines(vocabulary: Set<String>): List<KeywordLine> {
    if (!(threshold > 0f && threshold <= 1f)) {
      throw ListeningConfigInvalid("threshold $threshold is outside (0, 1]")
    }
    if (pauseMs <= 0) {
      throw ListeningConfigInvalid("pause $pauseMs ms is not positive")
    }
    return KeywordLines.parse(keywords, vocabulary)
  }
}
