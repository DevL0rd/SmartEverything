package expo.modules.healthconnect.planner

import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

sealed class RingSound {
  abstract fun toJson(): JSONObject

  class Tone(val id: String) : RingSound() {
    override fun toJson(): JSONObject = JSONObject().put("kind", TONE).put("id", id)
  }

  class File(val itemId: String, val name: String, val etag: String) : RingSound() {
    override fun toJson(): JSONObject =
      JSONObject().put("kind", FILE).put("item_id", itemId).put("name", name).put("etag", etag)
  }

  class Radio(val stationId: String, val name: String, val url: String) : RingSound() {
    override fun toJson(): JSONObject =
      JSONObject().put("kind", RADIO).put("station_id", stationId).put("name", name).put("url", url)
  }

  val title: String
    get() = when (this) {
      is Tone -> "the alarm tone"
      is File -> name
      is Radio -> name
    }

  companion object {
    const val DEFAULT_TONE = "default"
    private const val TONE = "tone"
    private const val FILE = "file"
    private const val RADIO = "radio"

    fun of(json: JSONObject): RingSound = when (val kind = json.getString("kind")) {
      TONE -> Tone(json.getString("id"))
      FILE -> File(json.getString("item_id"), json.getString("name"), json.getString("etag"))
      RADIO -> Radio(json.getString("station_id"), json.getString("name"), json.getString("url"))
      else -> throw IllegalArgumentException("unknown ring sound kind \"$kind\"")
    }
  }
}

enum class MathsDifficulty(val wire: String) {
  EASY("easy"),
  MEDIUM("medium"),
  HARD("hard");

  companion object {
    fun of(wire: String): MathsDifficulty =
      entries.firstOrNull { it.wire == wire } ?: throw IllegalArgumentException("unknown maths difficulty \"$wire\"")
  }
}

sealed class RingChallenge {
  abstract fun toJson(): JSONObject

  object None : RingChallenge() {
    override fun toJson(): JSONObject = JSONObject().put("kind", NONE)
  }

  class Maths(val difficulty: MathsDifficulty, val count: Int) : RingChallenge() {
    init {
      require(count > 0) { "a maths challenge has at least one problem, got $count" }
    }

    override fun toJson(): JSONObject =
      JSONObject().put("kind", MATHS).put("difficulty", difficulty.wire).put("count", count)
  }

  class Qr(val code: String) : RingChallenge() {
    init {
      require(code.isNotEmpty()) { "a QR challenge names its code" }
    }

    override fun toJson(): JSONObject = JSONObject().put("kind", QR).put("code", code)
  }

  class Steps(val steps: Int) : RingChallenge() {
    init {
      require(steps > 0) { "a steps challenge needs at least one step, got $steps" }
    }

    override fun toJson(): JSONObject = JSONObject().put("kind", STEPS).put("steps", steps)
  }

  val blocksStop: Boolean get() = this !is None

  companion object {
    private const val NONE = "none"
    private const val MATHS = "maths"
    private const val QR = "qr"
    private const val STEPS = "steps"

    fun of(json: JSONObject): RingChallenge = when (val kind = json.getString("kind")) {
      NONE -> None
      MATHS -> Maths(MathsDifficulty.of(json.getString("difficulty")), json.getInt("count"))
      QR -> Qr(json.getString("code"))
      STEPS -> Steps(json.getInt("steps"))
      else -> throw IllegalArgumentException("unknown ring challenge kind \"$kind\"")
    }
  }
}

class BedtimeWindow(val windDownAt: Instant, val bedAt: Instant, val wakeAt: Instant) {
  init {
    require(!windDownAt.isAfter(bedAt) && bedAt.isBefore(wakeAt)) {
      "wind-down starts no later than bed and bed comes before the wake time"
    }
  }

  fun toJson(): JSONObject =
    JSONObject().put("windDownAt", windDownAt.toString()).put("bedAt", bedAt.toString()).put("wakeAt", wakeAt.toString())

  companion object {
    fun of(json: JSONObject): BedtimeWindow = BedtimeWindow(
      Instant.parse(json.getString("windDownAt")),
      Instant.parse(json.getString("bedAt")),
      Instant.parse(json.getString("wakeAt"))
    )

    fun allOf(array: JSONArray): List<BedtimeWindow> = (0 until array.length()).map { of(array.getJSONObject(it)) }
  }
}
