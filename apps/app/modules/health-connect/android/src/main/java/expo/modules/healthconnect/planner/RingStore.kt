package expo.modules.healthconnect.planner

import android.content.SharedPreferences
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import org.json.JSONArray
import org.json.JSONObject

enum class RingKind(val wire: String) {
  ALARM("alarm"),
  TIMER("timer");

  companion object {
    fun of(wire: String): RingKind =
      entries.firstOrNull { it.wire == wire } ?: throw IllegalArgumentException("unknown ring kind \"$wire\"")
  }
}

class PhoneRing(
  val ringKey: String,
  val kind: RingKind,
  val refId: String,
  val dueAt: Instant,
  val sound: String,
  val rampSeconds: Int,
  val vibrate: Boolean,
  val label: String?,
  val rule: AlarmRule?
) {
  init {
    require((kind == RingKind.ALARM) == (rule != null)) { "an alarm ring carries its rule and a timer ring does not" }
  }

  val repeats: Boolean get() = rule?.repeats == true

  override fun equals(other: Any?): Boolean = other is PhoneRing && toJson().toString() == other.toJson().toString()

  override fun hashCode(): Int = toJson().toString().hashCode()

  fun toJson(): JSONObject = JSONObject()
    .put("ringKey", ringKey)
    .put("kind", kind.wire)
    .put("refId", refId)
    .put("dueAt", dueAt.toString())
    .put("sound", sound)
    .put("rampSeconds", rampSeconds)
    .put("vibrate", vibrate)
    .put("label", label ?: JSONObject.NULL)
    .also { json -> rule?.let { json.put("rule", ruleJson(it)) } }

  companion object {
    fun of(json: JSONObject): PhoneRing = PhoneRing(
      json.getString("ringKey"),
      RingKind.of(json.getString("kind")),
      json.getString("refId"),
      Instant.parse(json.getString("dueAt")),
      json.getString("sound"),
      json.getInt("rampSeconds"),
      json.getBoolean("vibrate"),
      if (json.isNull("label")) null else json.getString("label"),
      json.optJSONObject("rule")?.let(::ruleOf)
    )

    private fun ruleJson(rule: AlarmRule): JSONObject = JSONObject()
      .put("time", rule.time.toString())
      .put("days", JSONArray(rule.days.sorted()))
      .put("onceOn", rule.onceOn?.toString() ?: JSONObject.NULL)
      .put("skipOn", rule.skipOn?.toString() ?: JSONObject.NULL)

    private fun ruleOf(json: JSONObject): AlarmRule {
      val days = json.getJSONArray("days")
      return AlarmRule(
        LocalTime.parse(json.getString("time")),
        (0 until days.length()).map { days.getInt(it) }.toSet(),
        date(json, "onceOn"),
        date(json, "skipOn")
      )
    }

    private fun date(json: JSONObject, key: String): LocalDate? =
      if (json.isNull(key)) null else LocalDate.parse(json.getString(key))
  }
}

class RingSet(val hash: String, val rings: List<PhoneRing>) {
  init {
    require(rings.map { it.ringKey }.toSet().size == rings.size) { "ring keys must not repeat" }
  }

  companion object {
    fun parse(text: String): RingSet {
      val json = JSONObject(text)
      val rings = json.getJSONArray("rings")
      return RingSet(json.getString("hash"), (0 until rings.length()).map { PhoneRing.of(rings.getJSONObject(it)) })
    }
  }
}

class RingState(
  val clientId: String?,
  val hash: String?,
  val rings: List<PhoneRing>,
  val armed: Map<String, Long>,
  val settled: Set<String>
) {
  fun toJson(): JSONObject = JSONObject()
    .put("clientId", clientId ?: JSONObject.NULL)
    .put("hash", hash ?: JSONObject.NULL)
    .put("rings", JSONArray(rings.map { it.toJson() }))
    .put("armed", JSONObject(armed))
    .put("settled", JSONArray(settled.sorted()))

  companion object {
    val EMPTY = RingState(null, null, emptyList(), emptyMap(), emptySet())

    fun of(json: JSONObject): RingState {
      val rings = json.getJSONArray("rings")
      val armed = json.getJSONObject("armed")
      val settled = json.getJSONArray("settled")
      return RingState(
        if (json.isNull("clientId")) null else json.getString("clientId"),
        if (json.isNull("hash")) null else json.getString("hash"),
        (0 until rings.length()).map { PhoneRing.of(rings.getJSONObject(it)) },
        armed.keys().asSequence().associateWith { armed.getLong(it) },
        (0 until settled.length()).map { settled.getString(it) }.toSet()
      )
    }
  }
}

class RingStore(private val preferences: SharedPreferences) {
  fun load(): RingState =
    preferences.getString(STATE, null)?.let { RingState.of(JSONObject(it)) } ?: RingState.EMPTY

  fun save(state: RingState) {
    preferences.edit().putString(STATE, state.toJson().toString()).commit()
  }

  companion object {
    const val PREFERENCES = "expo.modules.healthconnect.planner-rings"
    private const val STATE = "state"
  }
}
