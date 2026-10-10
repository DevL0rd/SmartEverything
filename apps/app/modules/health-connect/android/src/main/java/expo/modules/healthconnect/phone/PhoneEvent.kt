package expo.modules.healthconnect.phone

import java.time.Instant
import org.json.JSONObject

data class PhoneEvent(val kind: String, val at: Instant, val details: Map<String, Any?>) {
  fun toJson(): JSONObject = JSONObject()
    .put("kind", kind)
    .put("at", at.toString())
    .put("details", JSONObject(details.mapValues { it.value ?: JSONObject.NULL }))

  companion object {
    fun contextChanged(from: ContextState, to: PhoneContextSnapshot, at: Instant): PhoneEvent = PhoneEvent(
      "phone_context_changed",
      at,
      mapOf("from" to from.wire, "to" to to.state.wire, "confidence" to to.confidence, "place" to to.place)
    )

    fun parked(place: String?, at: Instant): PhoneEvent = PhoneEvent("parked", at, mapOf("place" to place))

    fun place(kind: String, name: String, at: Instant): PhoneEvent = PhoneEvent(kind, at, mapOf("place" to name))

    fun fromJson(json: JSONObject): PhoneEvent {
      val details = json.getJSONObject("details")
      return PhoneEvent(
        json.getString("kind"),
        Instant.parse(json.getString("at")),
        details.keys().asSequence().associateWith { if (details.isNull(it)) null else details.get(it) }
      )
    }
  }
}
