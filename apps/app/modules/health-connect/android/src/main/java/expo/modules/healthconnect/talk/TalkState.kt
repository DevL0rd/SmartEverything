package expo.modules.healthconnect.talk

import org.json.JSONObject

data class TalkSpeakerInfo(val kind: String, val id: String, val label: String, val detail: String?) {
  fun toMap(): Map<String, Any?> = mapOf("kind" to kind, "id" to id, "label" to label, "detail" to detail)

  companion object {
    fun of(json: JSONObject) = TalkSpeakerInfo(
      json.getString("kind"),
      json.getString("id"),
      json.getString("label"),
      if (json.isNull("detail")) null else json.getString("detail")
    )
  }
}

data class Transmit(
  val status: String = "idle",
  val channelId: String? = null,
  val messageId: String? = null,
  val cameraId: String? = null,
  val startedAt: Long? = null,
  val limitSeconds: Int? = null
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "status" to status,
    "channelId" to channelId,
    "messageId" to messageId,
    "cameraId" to cameraId,
    "startedAt" to startedAt?.toDouble(),
    "limitSeconds" to limitSeconds?.toDouble()
  )
}

data class LiveTalk(val channelId: String, val conversationId: String, val label: String) {
  fun toMap(): Map<String, Any?> =
    mapOf("channelId" to channelId, "conversationId" to conversationId, "label" to label)
}

data class Receive(val channelId: String, val messageId: String, val speaker: TalkSpeakerInfo, val startedAt: Long)

data class TalkState(
  val link: String = "off",
  val problem: String? = null,
  val transmit: Transmit = Transmit(),
  val receive: Receive? = null,
  val level: Double = 0.0,
  val denial: Pair<String, String>? = null,
  val ending: String? = null,
  val live: LiveTalk? = null,
  val talkChannel: String = ""
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "link" to link,
    "problem" to problem,
    "transmit" to transmit.toMap(),
    "receive" to receive?.let {
      mapOf(
        "channelId" to it.channelId,
        "messageId" to it.messageId,
        "speaker" to it.speaker.toMap(),
        "startedAt" to it.startedAt.toDouble()
      )
    },
    "level" to level,
    "lastDenial" to denial?.let { mapOf("channelId" to it.first, "reason" to it.second) },
    "lastEnding" to ending,
    "live" to live?.toMap(),
    "talkChannel" to talkChannel
  )
}
