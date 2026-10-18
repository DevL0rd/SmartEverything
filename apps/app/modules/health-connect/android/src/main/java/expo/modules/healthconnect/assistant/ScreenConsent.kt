package expo.modules.healthconnect.assistant

import android.content.Intent
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.os.Build

object ScreenConsent {
  private const val ENTIRE_SCREEN_SDK = Build.VERSION_CODES.UPSIDE_DOWN_CAKE

  fun entireScreenOnly(sdk: Int): Boolean = sdk >= ENTIRE_SCREEN_SDK

  fun intent(manager: MediaProjectionManager): Intent =
    if (entireScreenOnly(Build.VERSION.SDK_INT)) {
      manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
    } else {
      manager.createScreenCaptureIntent()
    }
}
