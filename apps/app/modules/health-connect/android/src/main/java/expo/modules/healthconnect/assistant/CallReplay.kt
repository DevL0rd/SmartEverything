package expo.modules.healthconnect.assistant

import org.json.JSONArray
import org.json.JSONObject

class CallReplay(private val startedAt: Long) {
  private val latest = LinkedHashMap<String, String>()

  @Synchronized
  fun keep(message: JSONObject, text: String) {
    val type = message.optString("type")
    val key = when (type) {
      "capabilities", "call_state" -> type
      "caption" -> "caption:${message.optString("who")}"
      else -> return
    }
    latest.remove(key)
    latest[key] = text
  }

  @Synchronized
  fun snapshot(callId: String, muted: Boolean): JSONObject = JSONObject()
    .put("callId", callId)
    .put("startedAt", startedAt)
    .put("muted", muted)
    .put("replay", JSONArray(latest.values.toList()))
}
