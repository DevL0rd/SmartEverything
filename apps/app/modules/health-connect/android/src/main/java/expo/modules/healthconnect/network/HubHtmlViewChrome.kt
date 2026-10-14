package expo.modules.healthconnect.network

import android.net.Uri
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView

class HubHtmlViewChrome(private val diagnostics: HubBrowserDiagnostics) : WebChromeClient() {
  override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean { diagnostics.console(message); return true }
  override fun onPermissionRequest(request: PermissionRequest) { request.deny() }
  override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) { callback.invoke(origin, false, false) }
  override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
    callback.onReceiveValue(null)
    return true
  }
}
