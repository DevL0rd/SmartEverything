package expo.modules.healthconnect.overlay

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class OverlayPhonePrefs(
  val enabled: Boolean = true,
  val position: OverlayPosition = OverlayPosition.Centre,
  val glow: Boolean = true,
  val captions: Boolean = true,
  val display: OverlayDisplay = OverlayDisplay.Active,
  val whileSharing: WhileSharing = WhileSharing.Small,
  val theme: OverlayTheme = OverlayTheme.Dark,
) {
  val data: OverlayPrefsData
    get() = OverlayPrefsData(enabled, position, glow, captions, display, whileSharing)
}

object OverlayPrefs {
  private const val FILE = "expo.modules.healthconnect.overlay"
  private const val KEY = "prefs"
  private val json = Json { ignoreUnknownKeys = true }

  fun parse(text: String): OverlayPhonePrefs = json.decodeFromString(OverlayPhonePrefs.serializer(), text)

  fun save(context: Context, text: String): OverlayPhonePrefs = store(context, parse(text))

  fun store(context: Context, prefs: OverlayPhonePrefs): OverlayPhonePrefs {
    context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
      .putString(KEY, json.encodeToString(OverlayPhonePrefs.serializer(), prefs)).apply()
    return prefs
  }

  fun load(context: Context): OverlayPhonePrefs =
    context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, null)?.let(::parse) ?: OverlayPhonePrefs()
}
