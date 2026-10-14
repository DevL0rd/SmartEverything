package expo.modules.healthconnect.network

import android.net.Uri
import android.webkit.WebView
import org.json.JSONObject

class HubBrowserPolicy(json: String, private val view: WebView) : AutoCloseable {
  private val input = JSONObject(json)
  val id = input.getString("id")
  val url = input.getString("url")
  private val kind = input.getString("kind")
  private val origin = if (kind == "preview") Uri.parse(input.getString("origin")) else null
  private val lifecycle: HubBrowserProfile
  private val name: String get() = lifecycle.name
  private val profileClass = Class.forName("androidx.webkit.Profile")
  private val ownedProfile: Any
  private var closed = false
  private val cookies = HubBrowserCookies { profile() }
  init {
    require(id.length in 1..512 && kind in listOf("preview", "public"))
    require(allows(url))
    check(supported()) { "System WebView does not support isolated profiles" }
    val publicProfile = if (kind == "public" && input.has("profileId")) input.getString("profileId") else null
    if (publicProfile != null) require(UUID_PATTERN.matches(publicProfile)) { "Public browser requires its app profile identity" }
    lifecycle = HubBrowserProfile(view.context, publicProfile)
    Class.forName("androidx.webkit.WebViewCompat").getMethod("setProfile", WebView::class.java, String::class.java).invoke(null, view, name)
    ownedProfile = readProfile()
    lifecycle.capture(ownedProfile)
  }
  fun allows(value: String): Boolean {
    val parsed = Uri.parse(value)
    if (parsed.scheme != "https" || parsed.userInfo != null) return false
    if (origin != null) return parsed.scheme == origin.scheme && parsed.host == origin.host && parsed.port == origin.port
    val host = parsed.host?.lowercase() ?: return false
    return host.contains('.') && !Regex("[0-9.]+").matches(host) && !host.contains(':') && listOf("localhost", "local", "internal", "test", "invalid", "home").none { host == it || host.endsWith(".$it") }
  }
  private fun readProfile(): Any {
    check(!closed) { "The preview profile was closed" }
    val current = requireNotNull(Class.forName("androidx.webkit.WebViewCompat").getMethod("getProfile", WebView::class.java).invoke(null, view)) { "The preview has no isolated profile" }
    val actualName = profileClass.getMethod("getName").invoke(current)
    check(actualName == name && actualName != profileClass.getField("DEFAULT_PROFILE_NAME").get(null)) { "The preview does not own its isolated profile" }
    return current
  }
  fun profile(): Any { readProfile(); return ownedProfile }
  fun cookiesAvailable(): Boolean { if (closed) return false; profile(); return true }
  suspend fun clearCookies(checkOwner: () -> Unit) { cookies.clear(checkOwner) }
  override fun close() {
    if (closed) return
    if (kind == "public") {
      val manager = requireNotNull(android.webkit.CookieManager::class.java.cast(profileClass.getMethod("getCookieManager").invoke(ownedProfile)))
      manager.flush()
    }
    closed = true
    lifecycle.close()
  }
  companion object {
    private val UUID_PATTERN = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
    fun supported(): Boolean = Class.forName("androidx.webkit.WebViewFeature").getMethod("isFeatureSupported", String::class.java).invoke(null, "MULTI_PROFILE") == true
  }
}
