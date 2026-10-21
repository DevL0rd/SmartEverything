package expo.modules.healthconnect.network

import android.os.SystemClock
import android.view.KeyEvent
import android.webkit.WebView
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine
import org.json.JSONArray
import org.json.JSONObject

class HubBrowserPage(private val view: WebView) {
  private var id = ""
  fun bind(value: String) { check(id.isEmpty()); id = value; synchronized(views) { check(!views.containsKey(value)); views[value] = this } }
  private suspend fun evaluate(code: String): String = suspendCoroutine { continuation ->
    view.evaluateJavascript(code) { result -> continuation.resume(result ?: "null") }
  }
  private fun press(key: String, modifiers: JSONArray) {
    val code = HubBrowserKeys.keyCode(key) ?: error("The key $key cannot be pressed in this browser")
    val meta = HubBrowserKeys.metaState(List(modifiers.length()) { modifiers.getString(it) })
    val now = SystemClock.uptimeMillis()
    view.requestFocus()
    view.dispatchKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0, meta))
    view.dispatchKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0, meta))
  }
  fun close() { synchronized(views) { if (views[id] === this) views.remove(id) }; id = "" }
  companion object {
    private val views = mutableMapOf<String, HubBrowserPage>()
    private fun viewOf(id: String): HubBrowserPage = synchronized(views) { views[id] } ?: error("This browser was closed")
    suspend fun evaluate(id: String, code: String): String = viewOf(id).evaluate(code)
    fun press(id: String, json: String) {
      val input = JSONObject(json)
      viewOf(id).press(input.getString("key"), input.getJSONArray("modifiers"))
    }
  }
}
