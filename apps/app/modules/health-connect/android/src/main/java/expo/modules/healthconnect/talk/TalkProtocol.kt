package expo.modules.healthconnect.talk

import org.json.JSONObject

object TalkProtocol {
  fun handle(client: TalkClient, message: JSONObject) {
    when (message.getString("type")) {
      "ready" -> client.ready()
      "channels" -> Unit
      "granted" -> client.granted(
        message.getString("channelId"),
        message.getString("messageId"),
        message.getInt("limitSeconds")
      )
      "denied" -> client.denied(message.getString("channelId"), message.getString("reason"))
      "ended" -> client.ended(message.getString("messageId"), message.getString("reason"))
      "rx_start" -> client.rxStart(
        Receive(
          message.getString("channelId"),
          message.getString("messageId"),
          TalkSpeakerInfo.of(message.getJSONObject("speaker")),
          System.currentTimeMillis()
        )
      )
      "rx_end" -> client.rxEnd(message.getString("messageId"))
      "live_start" -> client.liveStart(
        LiveTalk(message.getString("channelId"), message.getString("conversationId"), message.getString("label"))
      )
      "live_end" -> client.liveEnd(message.getString("conversationId"))
    }
  }
}

object TalkLevel {
  fun of(pcm: ShortArray): Double {
    var sum = 0.0
    for (sample in pcm) {
      val value = sample / 32768.0
      sum += value * value
    }
    return minOf(1.0, Math.sqrt(sum / maxOf(1, pcm.size)) * 4)
  }
}
