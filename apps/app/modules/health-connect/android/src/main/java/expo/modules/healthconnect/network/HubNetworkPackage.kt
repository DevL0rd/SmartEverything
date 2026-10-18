package expo.modules.healthconnect.network

import android.app.Application
import android.content.Context
import com.facebook.react.modules.network.CustomClientBuilder
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import com.facebook.react.modules.websocket.WebSocketModule
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

class HubNetworkPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(HubNetworkListener())
}

private class HubNetworkListener : ApplicationLifecycleListener {
  override fun onCreate(application: Application) {
    OkHttpClientProvider.setOkHttpClientFactory(OkHttpClientFactory { HubPins.sharedClient { OkHttpClientProvider.createClientBuilder() } })
    WebSocketModule.setCustomClientBuilder(CustomClientBuilder { HubPins.pinned(it) })
  }
}
