package expo.modules.healthconnect.network

import android.graphics.Bitmap
import android.graphics.Rect
import android.view.PixelCopy
import android.os.Handler
import android.os.Looper
import android.app.Activity
import kotlin.coroutines.suspendCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import android.util.Base64
import android.webkit.WebView
import android.webkit.ConsoleMessage
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.util.UUID
import org.json.JSONObject

class HubBrowserDiagnostics(private val view: WebView, private val owner: () -> Boolean, private val activity: () -> Activity?, private val profile: () -> Any?, private val restore: suspend () -> Unit, private val deliver: (Map<String, Any?>) -> Unit, private val refusal: (String) -> Unit) {
  private val cookies = HubBrowserCookies { requireNotNull(profile()) { "The browser has no owned profile" } }
  private var id = ""
  private var epoch = ""
  private var sequence = 0
  private val refusals = ArrayDeque<Map<String, Any?>>()
  private var available = false
  private var document = ""
  private var previousDocument = ""
  private var loading = false
  private var requested = false
  private var epochPending = false
  private val records = ArrayDeque<Map<String, Any?>>()
  private val pending = mutableListOf<Map<String, Any?>>()
  private var retainedBytes = 0
  private val flush = Runnable { send() }
  fun bind(value: String) { check(id.isEmpty()); id = value; synchronized(views) { check(!views.containsKey(value)); views[value] = this } }
  private fun start() { view.removeCallbacks(flush); pending.clear(); records.clear(); refusals.clear(); retainedBytes = 0; sequence = 0; epoch = UUID.randomUUID().toString(); emitEpoch(); availability(true) }
  private fun emitEpoch() { emit(mapOf("kind" to "epoch", "id" to id, "epoch" to epoch, "clearCookies" to (profile() != null), "clearStorage" to (profile() != null && storageSupported()))) }
  @Synchronized fun prepare(url: String) {
    previousDocument = document
    document = url.substringBefore('#')
    loading = true
    requested = false
    epochPending = false
    start()
  }
  @Synchronized fun requested(url: String) {
    if (loading) {
      if (document == url.substringBefore('#')) requested = true
      return
    }
    previousDocument = document
    document = url.substringBefore('#')
    loading = true
    requested = true
    epochPending = true
    view.post { synchronized(this) { adoptEpoch() } }
  }
  @Synchronized fun navigating(url: String, redirect: Boolean) {
    val next = url.substringBefore('#')
    if (redirect) {
      if (loading && requested) document = next
      return
    }
    if (document != next) prepare(url)
  }
  @Synchronized fun started(url: String): Boolean {
    adoptEpoch()
    if (epoch.isEmpty()) prepare(url)
    if (document != url.substringBefore('#')) return false
    requested = true
    return true
  }
  @Synchronized fun finished(url: String): Boolean {
    if (document != url.substringBefore('#')) return false
    loading = false
    return true
  }
  private fun adoptEpoch() {
    if (!epochPending) return
    epochPending = false
    start()
  }
  fun replay() {
    if (epoch.isEmpty()) return
    emitEpoch()
    availability(true)
    records.toList().chunked(64).forEach { emit(mapOf("kind" to "records", "id" to id, "epoch" to epoch, "records" to it)) }
    emit(mapOf("kind" to "snapshot", "id" to id, "epoch" to epoch, "lastRecordId" to sequence, "refusedRecords" to refusals.toList()))
  }
  fun availability(force: Boolean = false) {
    val visible = owner() && view.isShown && view.hasWindowFocus()
    if (!force && visible == available) return
    if (visible) send()
    available = visible
    if (epoch.isNotEmpty()) emit(mapOf("kind" to "availability", "id" to id, "epoch" to epoch, "visible" to visible))
    if (!visible) send()
  }
  @Synchronized fun console(message: ConsoleMessage) {
    adoptEpoch()
    if (epoch.isEmpty() || !requested) return
    if (previousDocument != document && message.sourceId().substringBefore('#') == previousDocument) return
    val raw = message.message()
    val text = raw
    val source = message.sourceId() + ":" + message.lineNumber()
    val level = consoleLevel(message)
    val truncatedBytes = 0
    val record = mapOf("id" to ++sequence, "time" to Instant.now().toString(), "level" to level, "message" to text, "source" to source, "stack" to null, "truncatedBytes" to truncatedBytes)
    val bytes = JSONObject(record).toString().toByteArray().size
    if (bytes > 64 * 1024) {
      send()
      val refused = mapOf("recordId" to sequence, "byteLength" to bytes, "reason" to "The browser console entry exceeds its 64 KiB transport limit; its text was not modified or stored.")
      refusals.add(refused)
      while (refusals.size > 64) refusals.removeFirst()
      emit(mapOf("kind" to "record-refused", "id" to id, "epoch" to epoch, "recordId" to sequence, "byteLength" to bytes,
        "reason" to "The browser console entry exceeds its 64 KiB transport limit; its text was not modified or stored."))
      return
    }
    records.add(record); pending.add(record); retainedBytes += bytes
    while (records.size > 512 || retainedBytes > 1024 * 1024) retainedBytes -= JSONObject(records.removeFirst()).toString().toByteArray().size
    if (pending.size >= 64) send() else if (pending.size == 1) view.postDelayed(flush, 50)
  }
  private fun emit(event: Map<String, Any?>) {
    if (rawVersion == 2) { deliver(event); return }
    when (event["kind"]) {
      "snapshot" -> { if (refusals.isNotEmpty()) legacyRefusal(); return }
      "record-refused" -> { legacyRefusal(); return }
      "records" -> {
        val list = event["records"] as? List<*> ?: error("Console batch is missing")
        if (!list.all { legacyRecord(it) }) { legacyRefusal(); return }
      }
    }
    deliver(event)
  }
  private fun legacyRecord(value: Any?): Boolean {
    val record = value as? Map<*, *> ?: error("Console record is missing")
    return (record["message"] as? String)?.length?.let { it <= 8192 } == true &&
      listOf("source", "stack").all { (record[it] as? String)?.length?.let { size -> size <= 2048 } != false }
  }
  private fun legacyRefusal() { refusal("Update this app to receive complete raw console output. This console batch was refused without modifying its text.") }
  private fun consoleLevel(message: ConsoleMessage): String = when(message.messageLevel()) {
    ConsoleMessage.MessageLevel.ERROR -> "error"
    ConsoleMessage.MessageLevel.WARNING -> "warning"
    ConsoleMessage.MessageLevel.DEBUG -> "debug"
    else -> "info"
  }
  private fun send() { view.removeCallbacks(flush); if (pending.isEmpty()) return; val batch = pending.toList(); pending.clear(); emit(mapOf("kind" to "records", "id" to id, "epoch" to epoch, "records" to batch)) }
  @Synchronized private fun check(expected: String) {
    check(synchronized(views) { views[id] === this }) { "This preview was closed or replaced" }
    check(!epochPending && requested && epoch == expected && epoch.isNotEmpty() && owner() && view.isShown && view.hasWindowFocus() && view.windowVisibility == android.view.View.VISIBLE && view.width > 0 && view.height > 0) { "The preview is hidden, inactive or changed" }
  }
  private suspend fun clearCookies(expected: String) {
    check(expected)
    val owned = profile() ?: error("Cookie clearing requires an owned isolated preview profile")
    cookies.clear {
      check(expected)
      check(profile() === owned) { "The preview profile owner changed during cookie clearing" }
    }
    restore()
  }
  private suspend fun clearStorage(expected: String) {
    check(expected)
    val owned = requireNotNull(profile()) { "Website data clearing requires its owned profile" }
    check(storageSupported()) { "Website data clearing is unsupported by this WebView provider" }
    val storage = requireNotNull(android.webkit.WebStorage::class.java.cast(Class.forName("androidx.webkit.Profile").getMethod("getWebStorage").invoke(owned)))
    suspendCoroutine<Unit> { continuation ->
      Class.forName("androidx.webkit.WebStorageCompat").getMethod("deleteBrowsingData", android.webkit.WebStorage::class.java, Runnable::class.java)
        .invoke(null, storage, Runnable { continuation.resume(Unit) })
    }
    check(expected)
    check(profile() === owned) { "Website data profile changed while clearing" }
    restore()
    suspendCoroutine<Unit> { continuation ->
      view.evaluateJavascript("sessionStorage.clear();localStorage.clear();", { continuation.resume(Unit) })
    }
    check(expected)
  }
  suspend fun capture(expected: String): Map<String, Any> {
    check(expected)
    require(view.width.toLong()*view.height <= 16_000_000) { "Preview viewport exceeds the capture pixel limit" }
    val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
    try {
      pixels(bitmap, expected)
      check(expected)
      val bytes = ByteArrayOutputStream().apply { check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, this)) }.toByteArray()
      require(bytes.size in 1..4*1024*1024) { "Preview image exceeds the capture byte limit" }
      return mapOf("dataBase64" to Base64.encodeToString(bytes, Base64.NO_WRAP), "mime" to "image/png", "width" to view.width, "height" to view.height, "scale" to view.resources.displayMetrics.density.toDouble(), "capturedAt" to Instant.now().toString())
    } finally { bitmap.recycle() }
  }
  private suspend fun pixels(bitmap: Bitmap, expected: String) {
    check(expected)
    val window = activity()?.window ?: error("The preview has no owning Activity window")
    check(window.decorView.windowToken == view.windowToken) { "The preview Activity window changed" }
    val location = IntArray(2); view.getLocationInWindow(location)
    val bounds = Rect(location[0], location[1], location[0]+view.width, location[1]+view.height)
    val visible = Rect(); check(view.getGlobalVisibleRect(visible) && visible.width() == view.width && visible.height() == view.height) { "The preview viewport is clipped or hidden" }
    suspendCoroutine<Unit> { continuation ->
      PixelCopy.request(window, bounds, bitmap, { result ->
        if (result == PixelCopy.SUCCESS) continuation.resume(Unit)
        else continuation.resumeWithException(IllegalStateException("The current preview pixels could not be captured: $result"))
      }, Handler(Looper.getMainLooper()))
    }
    check(expected)
    check(window.decorView.windowToken == view.windowToken && activity()?.window === window) { "The preview Activity window changed during capture" }
    checkBounds(bitmap, bounds)
  }
  private fun checkBounds(bitmap: Bitmap, bounds: Rect) {
    val location = IntArray(2); view.getLocationInWindow(location)
    val visible = Rect()
    check(view.width == bitmap.width && view.height == bitmap.height && location[0] == bounds.left && location[1] == bounds.top && view.getGlobalVisibleRect(visible) && visible.width() == bitmap.width && visible.height() == bitmap.height) { "The preview viewport layout changed during capture" }
  }
  @Synchronized fun close() { view.removeCallbacks(flush); synchronized(views) { if (views[id] === this) views.remove(id) }; pending.clear(); records.clear(); requested = false; epochPending = false }
  companion object {
    private fun storageSupported(): Boolean = Class.forName("androidx.webkit.WebViewFeature").getMethod("isFeatureSupported", String::class.java).invoke(null, "DELETE_BROWSING_DATA") == true
    @Volatile private var rawVersion = 1
    private val views = mutableMapOf<String, HubBrowserDiagnostics>()
    fun replayAll(version: Int) { require(version == 1 || version == 2); rawVersion = version; synchronized(views) { views.values.toList() }.forEach { it.replay() } }
    suspend fun perform(json: String): Map<String, Any>? {
      val input = JSONObject(json); require(input.length() == 3)
      val value = synchronized(views) { views[input.getString("id")] } ?: error("This preview was closed")
      val expected = input.getString("epoch")
      return when (input.getString("action")) {
        "capture" -> value.capture(expected)
        "clear-cookies" -> { value.clearCookies(expected); null }
        "clear-storage" -> { value.clearStorage(expected); null }
        "clear-cache" -> error("Cache-only clearing for this preview is unavailable on Android")
        else -> error("Unknown preview diagnostics action")
      }
    }
  }
}
