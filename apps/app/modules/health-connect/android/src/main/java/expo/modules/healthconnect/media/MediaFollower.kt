package expo.modules.healthconnect.media

import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.PlaybackState

data class NowPlaying(
  val playing: Boolean?,
  val track: String,
  val artist: String,
  val app: String?,
  val positionSeconds: Int,
  val durationSeconds: Int
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "playing" to playing,
    "track" to track,
    "artist" to artist,
    "app" to app,
    "positionSeconds" to positionSeconds,
    "durationSeconds" to durationSeconds
  )
}

class MediaFollower(private val context: Context, private val changed: () -> Unit) {
  private var controller: MediaController? = null
  private val callback = object : MediaController.Callback() {
    override fun onPlaybackStateChanged(state: PlaybackState?) = changed()
    override fun onMetadataChanged(metadata: MediaMetadata?) = changed()
  }

  fun follow(controllers: List<MediaController>) {
    controller?.unregisterCallback(callback)
    controller = controllers.firstOrNull()
    controller?.registerCallback(callback)
    changed()
  }

  fun release() {
    controller?.unregisterCallback(callback)
    controller = null
  }

  fun transport(): MediaController.TransportControls? = controller?.transportControls

  fun nowPlaying(): NowPlaying {
    val current = controller
    val metadata = current?.metadata
    val state = current?.playbackState
    return NowPlaying(
      playing = state?.let { it.state == PlaybackState.STATE_PLAYING },
      track = metadata?.getString(MediaMetadata.METADATA_KEY_TITLE).orEmpty(),
      artist = metadata?.getString(MediaMetadata.METADATA_KEY_ARTIST).orEmpty(),
      app = current?.packageName?.let { appLabel(it) },
      positionSeconds = ((state?.position ?: 0L) / MILLIS).toInt(),
      durationSeconds = ((metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION) ?: 0L) / MILLIS).toInt()
    )
  }

  private fun appLabel(packageName: String): String {
    val packages = context.packageManager
    return packages.getApplicationLabel(packages.getApplicationInfo(packageName, 0)).toString()
  }

  private companion object {
    const val MILLIS = 1000L
  }
}
