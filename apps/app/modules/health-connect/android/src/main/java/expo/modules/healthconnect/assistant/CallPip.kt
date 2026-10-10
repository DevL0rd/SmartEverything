package expo.modules.healthconnect.assistant

import android.app.Activity
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Log
import android.util.Rational

object CallPip {
  private const val TAG = "SmartEverythingCalls"
  private const val WIDTH = 3
  private const val HEIGHT = 4

  @Volatile
  private var wanted = false

  fun want(activity: Activity, on: Boolean) {
    wanted = on
    if (supported(activity)) activity.runOnUiThread { activity.setPictureInPictureParams(params(activity)) }
  }

  fun enterIfWanted(activity: Activity) {
    if (!wanted || !supported(activity) || Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return
    try {
      activity.enterPictureInPictureMode(params(activity))
    } catch (failure: IllegalStateException) {
      Log.e(TAG, "The app could not enter picture in picture: ${failure.message}")
    }
  }

  private fun supported(activity: Activity): Boolean =
    activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

  private fun params(activity: Activity): PictureInPictureParams {
    val builder = PictureInPictureParams.Builder()
      .setAspectRatio(Rational(WIDTH, HEIGHT))
      .setActions(
        listOf(
          action(activity, "Mute", android.R.drawable.ic_lock_silent_mode, CallActions.MUTE),
          action(activity, "End call", android.R.drawable.ic_menu_close_clear_cancel, CallActions.END)
        )
      )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setAutoEnterEnabled(wanted)
    return builder.build()
  }

  private fun action(activity: Activity, label: String, icon: Int, name: String): RemoteAction =
    RemoteAction(Icon.createWithResource(activity, icon), label, label, CallActions.pending(activity, name))
}
