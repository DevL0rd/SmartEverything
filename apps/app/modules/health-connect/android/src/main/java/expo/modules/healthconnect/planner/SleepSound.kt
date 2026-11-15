package expo.modules.healthconnect.planner

import java.util.Random
import org.json.JSONObject

enum class NoiseColour(val wire: String) {
  WHITE("white"),
  PINK("pink"),
  BROWN("brown");

  companion object {
    fun of(wire: String): NoiseColour =
      entries.firstOrNull { it.wire == wire } ?: throw IllegalArgumentException("unknown noise colour \"$wire\"")
  }
}

sealed class SleepSource {
  abstract val title: String

  class Noise(val colour: NoiseColour) : SleepSource() {
    override val title: String get() = "${colour.wire.replaceFirstChar { it.uppercase() }} noise"
  }

  class Files(val files: List<RingSound.File>, val shuffle: Boolean) : SleepSource() {
    init {
      require(files.isNotEmpty()) { "a sleep sound from files names at least one file" }
    }

    override val title: String get() = files.first().name
  }

  class Radio(val name: String, val url: String) : SleepSource() {
    override val title: String get() = name
  }

  companion object {
    fun of(json: JSONObject): SleepSource = when (val kind = json.getString("kind")) {
      "noise" -> Noise(NoiseColour.of(json.getString("colour")))
      "files" -> {
        val files = json.getJSONArray("files")
        Files(
          (0 until files.length()).map { index ->
            files.getJSONObject(index).let { RingSound.File(it.getString("item_id"), it.getString("name"), it.getString("etag")) }
          },
          json.getBoolean("shuffle")
        )
      }
      "radio" -> Radio(json.getString("name"), json.getString("url"))
      else -> throw IllegalArgumentException("unknown sleep sound kind \"$kind\"")
    }
  }
}

class SleepRequest(val source: SleepSource, val timerMinutes: Int?, val fadeSeconds: Int) {
  init {
    require(timerMinutes == null || timerMinutes > 0) { "a sleep timer is a positive number of minutes, got $timerMinutes" }
    require(fadeSeconds >= 0) { "a fade is zero or more seconds, got $fadeSeconds" }
  }

  val timerMillis: Long? get() = timerMinutes?.let { it * MILLIS_PER_MINUTE }

  val fadeMillis: Long get() = fadeSeconds * MILLIS_PER_SECOND

  companion object {
    private const val MILLIS_PER_MINUTE = 60_000L
    private const val MILLIS_PER_SECOND = 1_000L

    fun parse(text: String): SleepRequest {
      val json = JSONObject(text)
      return SleepRequest(
        SleepSource.of(json.getJSONObject("source")),
        if (json.isNull("timerMinutes")) null else json.getInt("timerMinutes"),
        json.getInt("fadeSeconds")
      )
    }
  }
}

object SleepFade {
  fun volume(elapsedMillis: Long, timerMillis: Long?, fadeMillis: Long): Float {
    if (timerMillis == null) {
      return 1f
    }
    val remaining = timerMillis - elapsedMillis
    return when {
      remaining <= 0 -> 0f
      fadeMillis <= 0 || remaining >= fadeMillis -> 1f
      else -> remaining.toFloat() / fadeMillis
    }
  }

  fun finished(elapsedMillis: Long, timerMillis: Long?): Boolean = timerMillis != null && elapsedMillis >= timerMillis
}

class SleepQueue<T>(private val items: List<T>, private val shuffle: Boolean, private val random: Random = Random()) {
  private var order: List<T> = emptyList()
  private var position = 0

  init {
    require(items.isNotEmpty()) { "a sleep queue holds at least one item" }
  }

  fun next(): T {
    if (position >= order.size) {
      order = if (shuffle) items.shuffled(random) else items
      position = 0
    }
    return order[position++]
  }
}
