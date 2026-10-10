package expo.modules.healthconnect.talk

import android.content.Context
import android.content.Intent
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.view.KeyEvent

class HeadsetButton(context: Context, private val onPress: () -> Unit) {
  private val session = MediaSession(context, "smarteverything-talk").apply {
    setCallback(object : MediaSession.Callback() {
      override fun onMediaButtonEvent(intent: Intent): Boolean {
        val event = keyEventOf(intent) ?: return false
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0 && event.keyCode in KEYS) {
          onPress()
          return true
        }
        return event.keyCode in KEYS
      }
    })
    setPlaybackState(
      PlaybackState.Builder()
        .setActions(PlaybackState.ACTION_PLAY_PAUSE)
        .setState(PlaybackState.STATE_PAUSED, 0, 1f)
        .build()
    )
    isActive = true
  }

  fun release() {
    session.isActive = false
    session.release()
  }

  private companion object {
    @Suppress("DEPRECATION")
    fun keyEventOf(intent: Intent): KeyEvent? =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
      } else {
        intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT)
      }

    val KEYS = setOf(KeyEvent.KEYCODE_HEADSETHOOK, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE)
  }
}
