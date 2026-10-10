package expo.modules.healthconnect.talk

import android.content.Context
import org.json.JSONArray

data class TalkChannel(val id: String, val name: String)

class TalkStore(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  fun channels(): List<TalkChannel> {
    val array = JSONArray(preferences.getString(CHANNELS, "[]"))
    return (0 until array.length()).map { index ->
      val item = array.getJSONObject(index)
      TalkChannel(item.getString("id"), item.getString("name"))
    }
  }

  fun setChannels(json: String, talkChannel: String) {
    JSONArray(json)
    preferences.edit().putString(CHANNELS, json).putString(TALK_CHANNEL, talkChannel).apply()
  }

  fun talkChannel(): String = preferences.getString(TALK_CHANNEL, "").orEmpty()

  fun setTalkChannel(channelId: String) {
    preferences.edit().putString(TALK_CHANNEL, channelId).apply()
  }

  fun enabled(): Boolean = preferences.getBoolean(ENABLED, false)

  fun setEnabled(on: Boolean) {
    preferences.edit().putBoolean(ENABLED, on).apply()
  }

  fun headset(): Boolean = preferences.getBoolean(HEADSET, false)

  fun setHeadset(on: Boolean) {
    preferences.edit().putBoolean(HEADSET, on).apply()
  }

  fun channelName(channelId: String?): String =
    channels().firstOrNull { it.id == channelId }?.name ?: "No channel"

  private companion object {
    const val PREFERENCES = "expo.modules.healthconnect.talk"
    const val CHANNELS = "channels"
    const val TALK_CHANNEL = "talkChannel"
    const val ENABLED = "enabled"
    const val HEADSET = "headset"
  }
}
