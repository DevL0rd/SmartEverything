package expo.modules.healthconnect.phone

import expo.modules.healthconnect.push.PhoneActionOrigin

enum class LinkOpening { Direct, TapToOpen }

object PhoneAskers {
  const val APP = "app"
  private val SOURCES = mapOf(
    APP to "The SmartEverything app",
    "assistant" to "Your assistant",
    "automation" to "An automation",
    "scene" to "A scene"
  )

  fun describe(source: String, client: String? = null): String {
    val who = SOURCES[source] ?: source
    return if (client.isNullOrBlank()) who else "$who ($client)"
  }

  fun describe(origin: PhoneActionOrigin): String = describe(origin.source, origin.client)

  fun linkOpening(origin: PhoneActionOrigin, overlayAllowed: Boolean): LinkOpening =
    if (origin.source == APP && overlayAllowed) LinkOpening.Direct else LinkOpening.TapToOpen
}
