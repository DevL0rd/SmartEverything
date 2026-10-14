package expo.modules.healthconnect.network

import android.graphics.Bitmap
import android.webkit.HttpAuthHandler
import android.webkit.ClientCertRequest
import android.webkit.SslErrorHandler
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebResourceError
import android.webkit.RenderProcessGoneDetail
import android.net.http.SslError
import java.io.ByteArrayInputStream

class HubHtmlViewClient(private val owner: HubHtmlView) : WebViewClient() {
  override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
    val url = request.url.toString()
    if (!owner.allows(url)) return true
    if (request.isForMainFrame) owner.navigating(url, request.isRedirect)
    return false
  }
  @Deprecated("Android compatibility navigation callback")
  override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = !owner.allows(url)
  override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
    if (owner.allowsRequest(request.url.toString(), request.method, request.isForMainFrame)) {
      if (request.isForMainFrame) owner.requested(request.url.toString())
      return null
    }
    if (request.url.scheme in listOf("data", "blob")) return null
    return WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(ByteArray(0)))
  }
  override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
    if (!owner.allows(url)) { owner.retire(); return }
    if (!owner.started(url)) return
    owner.status(true, null)
  }
  override fun onPageFinished(view: WebView, url: String) {
    if (owner.allows(url) && owner.finished(url)) owner.status(false, null)
  }
  override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
    if (request.isForMainFrame) owner.status(false, "The HTML preview could not be loaded.")
  }
  override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
    if (request.isForMainFrame) owner.status(false, "The HTML page is unavailable.")
  }
  override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) { handler.cancel() }
  override fun onReceivedHttpAuthRequest(view: WebView, handler: HttpAuthHandler, host: String, realm: String) { handler.cancel() }
  override fun onReceivedClientCertRequest(view: WebView, request: ClientCertRequest) { request.cancel() }
  override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
    owner.retire()
    return true
  }
}
