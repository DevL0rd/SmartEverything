package expo.modules.healthconnect.network

import android.content.Context
import android.webkit.WebView
import android.webkit.WebSettings
import android.webkit.CookieManager
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import expo.modules.kotlin.viewevent.EventDispatcher
import org.json.JSONObject

class HubHtmlView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true
  private val onStatus by EventDispatcher<Map<String, Any?>>()
  private val onDiagnostic by EventDispatcher<Map<String, Any?>>()
  private val page = WebView(context)
  private var policy: HubBrowserPolicy? = null
  @Volatile private var projectProfile: HubHtmlProfile? = null
  private val diagnostics = HubBrowserDiagnostics(page, { active && displayed && allows(authorizedUrl) }, { appContext.currentActivity }, { policy?.profile() ?: projectProfile?.profile() }, { onDiagnostic(it) }, { status(false, it) })
  private var displayed = false
  @Volatile private var active = false
  @Volatile private var authorizedUrl = ""
  @Volatile private var fence: (() -> Unit)? = null
  @Volatile private var projectOrigin: String? = null
  private var browserId = ""
  private var commandSequence = 0L
  private var detach: (() -> Unit)? = null
  @Volatile private var destroyed = false
  init { addView(page, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)) }
  private fun configurePage() {
    page.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = policy != null || projectProfile != null
      allowFileAccess = false
      allowContentAccess = false
      blockNetworkLoads = false
      cacheMode = WebSettings.LOAD_NO_CACHE
      mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
      javaScriptCanOpenWindowsAutomatically = false
      setSupportMultipleWindows(true)
      mediaPlaybackRequiresUserGesture = true
      setGeolocationEnabled(false)
    }
    CookieManager.getInstance().setAcceptThirdPartyCookies(page, false)
    page.webViewClient = HubHtmlViewClient(this)
    page.webChromeClient = HubHtmlViewChrome(diagnostics)
    page.setDownloadListener { _, _, _, _, _ -> status(false, "Downloads are blocked in this HTML preview.") }
  }
  fun bind(id: String, url: String, origin: String?, check: () -> Unit, detached: () -> Unit) {
    check(!active) { "HTML view is already bound" }
    check.invoke()
    check(projectProfile == null) { "Project preview profile is already owned" }
    if (origin != null || HubBrowserPolicy.supported()) projectProfile = HubHtmlProfile(page)
    try {
      configurePage()
      browserId = id
      diagnostics.bind(id)
      authorizedUrl = url
      projectOrigin = origin
      fence = check
      detach = detached
      active = true
      diagnostics.prepare(url)
      page.loadUrl(url)
    } catch (failure: Exception) { active = false; closeProjectProfile(); throw failure }
  }
  fun bindBrowser(json: String) {
    check(!active)
    val value = HubBrowserPolicy(json, page)
    policy = value
    configurePage()
    browserId = value.id
    diagnostics.bind(value.id)
    authorizedUrl = value.url
    active = true
    diagnostics.prepare(value.url)
    page.loadUrl(value.url)
  }
  fun displayed(value: Boolean) { displayed = value; page.visibility = if (value) android.view.View.VISIBLE else android.view.View.INVISIBLE; diagnostics.availability() }
  override fun onWindowFocusChanged(hasWindowFocus: Boolean) { super.onWindowFocusChanged(hasWindowFocus); diagnostics.availability() }
  fun requested(url: String) { diagnostics.requested(url) }
  fun navigating(url: String, redirect: Boolean) { diagnostics.navigating(url, redirect) }
  fun started(url: String): Boolean = diagnostics.started(url)
  fun finished(url: String): Boolean = diagnostics.finished(url)
  fun allowsRequest(url: String, method: String): Boolean = allows(url) && (policy != null || method in listOf("GET", "HEAD"))
  fun allows(url: String): Boolean {
    val browser = policy
    if (browser != null) return active && browser.allows(url)
    if (!active) return false
    val origin = projectOrigin
    if (origin == null && url.substringBefore('#') != authorizedUrl) return false
    if (origin != null && !sameProjectOrigin(url, origin)) return false
    return runCatching {
      if (origin != null) (projectProfile ?: error("Project preview has no owned profile")).check()
      fence?.invoke() ?: error("HTML view has no lease fence")
    }.isSuccess
  }
  private fun sameProjectOrigin(url: String, origin: String): Boolean = runCatching {
    val parsed = java.net.URI(url)
    parsed.scheme == "http" && parsed.host == "127.0.0.1" && parsed.rawUserInfo == null &&
      "${parsed.scheme}://${parsed.host}:${parsed.port}" == origin
  }.getOrDefault(false)
  fun command(json: String) {
    val input = JSONObject(json)
    require(input.length() in 2..3)
    val sequence = input.getLong("sequence")
    require(sequence > 0)
    if (sequence <= commandSequence) return
    commandSequence = sequence
    check(allows(authorizedUrl)) { "HTML view lease was withdrawn" }
    when (input.getString("action")) {
      "navigate" -> { val value = input.getString("url"); check(allows(value)); if (value == authorizedUrl || value.substringBefore('#') != authorizedUrl.substringBefore('#')) diagnostics.prepare(value); authorizedUrl = value; page.loadUrl(value) }
      "reload" -> { val value = page.url ?: authorizedUrl; check(allows(value)); diagnostics.prepare(value); page.reload() }
      "stop" -> { page.stopLoading(); status(false, null) }
      "back" -> if (page.canGoBack()) page.goBack()
      "forward" -> if (page.canGoForward()) page.goForward()
      else -> error("Unknown HTML view action")
    }
  }
  fun status(loading: Boolean, problem: String?) {
    if (browserId.isEmpty()) return
    onStatus(mapOf("id" to browserId, "url" to (if (policy == null) authorizedUrl else (page.url ?: authorizedUrl)), "loading" to loading,
      "back" to (active && page.canGoBack()), "forward" to (active && page.canGoForward()), "problem" to problem))
  }
  fun retire() {
    diagnostics.close()
    val wasActive = active
    active = false
    if (!wasActive) return
    fence = null
    post {
      if (destroyed) return@post
      page.stopLoading()
      page.visibility = android.view.View.GONE
      try { page.loadData("", "text/html", "UTF-8") } finally { closeProjectProfile() }
      status(false, "This HTML lease was withdrawn. Choose its current publication.")
    }
  }
  private fun closeProjectProfile() {
    val owned = projectProfile
    projectProfile = null
    owned?.close()
  }
  fun dispose() {
    diagnostics.close()
    active = false
    fence = null
    detach?.invoke()
    detach = null
    if (!destroyed) {
      destroyed = true
      val retired = policy
      policy = null
      try {
        page.stopLoading()
        removeView(page)
        page.destroy()
      } finally {
        try { retired?.close() } finally { closeProjectProfile() }
      }
    }
  }
}
