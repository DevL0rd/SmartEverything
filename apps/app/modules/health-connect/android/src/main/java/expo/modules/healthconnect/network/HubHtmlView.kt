package expo.modules.healthconnect.network

import android.content.Context
import android.webkit.WebView
import android.webkit.WebSettings
import android.webkit.CookieManager
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import expo.modules.kotlin.viewevent.EventDispatcher

class HubHtmlView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true
  private val onStatus by EventDispatcher<Map<String, Any?>>()
  private val page = WebView(context)
  private var policy: HubBrowserPolicy? = null
  @Volatile private var projectProfile: HubHtmlProfile? = null
  private val access = HubBrowserPage(page)
  @Volatile private var active = false
  @Volatile private var authorizedUrl = ""
  @Volatile private var fence: (() -> Unit)? = null
  @Volatile private var projectOrigin: String? = null
  private var browserId = ""
  @Volatile private var source: String? = null
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
    page.webChromeClient = HubHtmlViewChrome()
    page.setDownloadListener { _, _, _, _, _ -> status(false, "Downloads are blocked in this browser.") }
  }
  fun bind(id: String, url: String, origin: String, cookie: String, profileId: String, check: () -> Unit, detached: () -> Unit) {
    check(!active) { "HTML view is already bound" }
    check.invoke()
    check(projectProfile == null) { "Project preview profile is already owned" }
    val owned = HubHtmlProfile(page, profileId)
    projectProfile = owned
    try {
      configurePage()
      browserId = id
      access.bind(id)
      authorizedUrl = url
      projectOrigin = origin
      fence = check
      detach = detached
      active = true
      owned.admit(origin, cookie) { page.post { if (active) page.loadUrl(url) } }
    } catch (failure: Exception) { active = false; closeProjectProfile(); throw failure }
  }
  fun attached(value: String): Boolean = active && source == value
  fun attachedElsewhere(): Boolean = active && source != null
  fun markAttached(value: String) { source = value }
  fun unbind() {
    check(source != null) { "HTML view is not bound to a page" }
    access.close()
    active = false
    fence = null
    source = null
    detach?.invoke()
    detach = null
    page.stopLoading()
    closeProjectProfile()
  }
  fun bindBrowser(json: String) {
    check(!active)
    val value = HubBrowserPolicy(json, page)
    policy = value
    configurePage()
    browserId = value.id
    access.bind(value.id)
    authorizedUrl = value.url
    active = true
    page.loadUrl(value.url)
  }
  fun displayed(value: Boolean) { page.visibility = if (value) android.view.View.VISIBLE else android.view.View.INVISIBLE }
  fun allowsRequest(url: String, method: String, mainFrame: Boolean): Boolean {
    if (allows(url)) return policy != null || method in listOf("GET", "HEAD")
    if (!active || mainFrame || projectOrigin == null || method !in listOf("GET", "HEAD")) return false
    return runCatching {
      (projectProfile ?: error("HTML page has no owned profile")).check()
      (fence ?: error("HTML page has no ownership fence")).invoke()
      publicAsset(url)
    }.getOrDefault(false)
  }
  private fun publicAsset(url: String): Boolean {
    val parsed = java.net.URI(url)
    val host = parsed.host?.lowercase() ?: return false
    return parsed.scheme == "https" && parsed.rawUserInfo == null && HubBrowserPolicy.publicHost(host)
  }
  fun allows(url: String): Boolean {
    val browser = policy
    if (browser != null) return active && browser.allows(url)
    if (!active) return false
    val origin = projectOrigin
    if (origin == null && url.substringBefore('#') != authorizedUrl) return false
    if (origin != null && !sameProjectOrigin(url, origin)) return false
    return runCatching {
      if (origin != null) (projectProfile ?: error("Project preview has no owned profile")).check()
      fence?.invoke() ?: error("HTML view has no ownership fence")
    }.isSuccess
  }
  private fun sameProjectOrigin(url: String, origin: String): Boolean = runCatching {
    val parsed = java.net.URI(url)
    parsed.scheme == "http" && parsed.host == "127.0.0.1" && parsed.rawUserInfo == null &&
      "${parsed.scheme}://${parsed.host}:${parsed.port}" == origin
  }.getOrDefault(false)
  private fun owned() {
    if (allows(authorizedUrl)) return
    retire()
    error("This page was closed")
  }
  fun navigate(value: String) {
    owned()
    check(allows(value))
    authorizedUrl = value
    page.loadUrl(value)
  }
  fun reload() {
    owned()
    val value = page.url ?: authorizedUrl
    check(allows(value))
    page.reload()
  }
  fun stop() { owned(); page.stopLoading(); status(false, null) }
  fun back() { owned(); if (page.canGoBack()) page.goBack() }
  fun forward() { owned(); if (page.canGoForward()) page.goForward() }
  fun status(loading: Boolean, problem: String?) {
    if (browserId.isEmpty()) return
    onStatus(mapOf("id" to browserId, "url" to (if (policy == null) authorizedUrl else (page.url ?: authorizedUrl)), "loading" to loading,
      "back" to (active && page.canGoBack()), "forward" to (active && page.canGoForward()), "problem" to problem))
  }
  fun retire() {
    access.close()
    val wasActive = active
    active = false
    source = null
    if (!wasActive) return
    fence = null
    post {
      if (destroyed) return@post
      page.stopLoading()
      page.visibility = android.view.View.GONE
      try { page.loadData("", "text/html", "UTF-8") } finally { closeProjectProfile() }
      status(false, RETIRED_PROBLEM)
    }
  }
  private fun closeProjectProfile() {
    val owned = projectProfile
    projectProfile = null
    owned?.close()
  }
  fun dispose() {
    access.close()
    active = false
    source = null
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
  companion object {
    const val RETIRED_PROBLEM = "This page was closed. Reload to open it again."
  }
}
