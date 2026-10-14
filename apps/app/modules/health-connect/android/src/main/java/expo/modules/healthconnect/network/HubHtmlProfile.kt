package expo.modules.healthconnect.network

import android.webkit.WebView

class HubHtmlProfile(view: WebView) : AutoCloseable {
  private val lifecycle: HubBrowserProfile
  private val type = Class.forName("androidx.webkit.Profile")
  private val owned: Any
  @Volatile private var closed = false
  init {
    check(HubBrowserPolicy.supported()) { "Project previews require isolated WebView profiles" }
    lifecycle = HubBrowserProfile(view.context)
    try {
      val compat = Class.forName("androidx.webkit.WebViewCompat")
      compat.getMethod("setProfile", WebView::class.java, String::class.java).invoke(null, view, lifecycle.name)
      owned = requireNotNull(compat.getMethod("getProfile", WebView::class.java).invoke(null, view)) { "Project preview has no owned profile" }
      check()
      lifecycle.capture(owned)
    } catch (failure: Exception) { lifecycle.close(); throw failure }
  }
  fun check() {
    check(!closed) { "Project preview profile was retired" }
    val actual = type.getMethod("getName").invoke(owned)
    check(actual == lifecycle.name && actual != type.getField("DEFAULT_PROFILE_NAME").get(null)) { "Project preview does not own its isolated profile" }
  }
  fun profile(): Any { check(); return owned }
  override fun close() {
    if (closed) return
    closed = true
    lifecycle.close()
  }
}
