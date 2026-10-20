package expo.modules.healthconnect.media

import android.app.Application
import android.content.Context
import android.media.AudioAttributes
import com.oney.WebRTCModule.WebRTCModuleOptions
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

class MediaAudioPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(MediaAudioListener())
}

private class MediaAudioListener : ApplicationLifecycleListener {
  override fun onCreate(application: Application) {
    val playback = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA)
      .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
      .build()
    WebRTCModuleOptions.getInstance().audioAttributes = playback
  }
}
