package expo.modules.healthconnect.watch

import android.app.KeyguardManager
import android.app.Notification
import android.app.PendingIntent
import android.content.ComponentName
import android.media.AudioManager
import android.media.session.MediaSessionManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import expo.modules.healthconnect.media.MediaFollower
import expo.modules.healthconnect.media.NotificationObservers
import java.time.Instant
import java.util.Collections
import java.util.LinkedHashMap

class WatchNotificationListener : NotificationListenerService() {
  private val follower = MediaFollower(this) { mediaChanged() }
  private val sessions = MediaSessionManager.OnActiveSessionsChangedListener { follower.follow(it.orEmpty()) }

  override fun onListenerConnected() {
    active = this
    val manager = getSystemService(MediaSessionManager::class.java)
    val me = ComponentName(this, WatchNotificationListener::class.java)
    manager.addOnActiveSessionsChangedListener(sessions, me)
    follower.follow(manager.getActiveSessions(me))
    NotificationObservers.ALL.forEach { it.connected(this) }
    activeNotifications.orEmpty().forEach { sbn -> NotificationObservers.ALL.forEach { it.posted(this, sbn) } }
    WatchEvents.emit("notification_access", "connected")
  }

  override fun onListenerDisconnected() {
    getSystemService(MediaSessionManager::class.java).removeOnActiveSessionsChangedListener(sessions)
    follower.release()
    NotificationObservers.ALL.forEach { it.disconnected(this) }
    active = null
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    NotificationObservers.ALL.forEach { it.posted(this, sbn) }
    val rules = NotificationRules.read(this)
    if (!wanted(sbn, rules)) {
      return
    }
    val notification = toWatch(sbn, rules.content)
    remember(notification.id, sbn)
    WatchActions.send(WatchAction.Notify(notification))
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification) {
    NotificationObservers.ALL.forEach { it.removed(this, sbn) }
    val id = idOf(sbn)
    if (posted.remove(id) != null) {
      WatchActions.send(WatchAction.Dismiss(id, sbn.packageName))
    }
  }

  private fun wanted(sbn: StatusBarNotification, rules: NotificationPrefs): Boolean {
    val extras = sbn.notification
    val summary = extras.flags and Notification.FLAG_GROUP_SUMMARY != 0
    val ongoing = sbn.isOngoing || extras.flags and Notification.FLAG_FOREGROUND_SERVICE != 0
    val locked = getSystemService(KeyguardManager::class.java).isKeyguardLocked
    return rules.enabled && sbn.packageName in rules.apps && !summary && !ongoing &&
      (!rules.onlyWhenLocked || locked) && WatchActions.connected()
  }

  private fun toWatch(sbn: StatusBarNotification, content: NotificationContent): PhoneNotification {
    val extras = sbn.notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))
      ?.toString().orEmpty()
    val app = packageManager.getApplicationLabel(packageManager.getApplicationInfo(sbn.packageName, 0)).toString()
    return PhoneNotification(
      id = idOf(sbn),
      packageName = sbn.packageName,
      appName = app,
      title = when (content) {
        NotificationContent.APP -> app
        else -> title
      },
      body = when (content) {
        NotificationContent.FULL -> text.take(BODY_LIMIT)
        NotificationContent.TITLE -> ""
        NotificationContent.APP -> "New notification"
      },
      time = Instant.ofEpochMilli(sbn.postTime),
      canOpen = sbn.notification.contentIntent != null
    )
  }

  private fun mediaChanged() {
    val nowPlaying = follower.nowPlaying()
    NotificationObservers.ALL.forEach { it.media(this, nowPlaying) }
    if (NotificationRules.read(this).music) {
      WatchActions.send(WatchAction.Music(musicState()))
    }
  }

  fun musicState(): MusicState {
    val audio = getSystemService(AudioManager::class.java)
    val volume = audio.getStreamVolume(AudioManager.STREAM_MUSIC) * 100 / audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    val nowPlaying = follower.nowPlaying()
    return MusicState(
      playing = nowPlaying.playing,
      track = nowPlaying.track,
      artist = nowPlaying.artist,
      positionSeconds = nowPlaying.positionSeconds,
      durationSeconds = nowPlaying.durationSeconds,
      volumePercent = volume
    )
  }

  fun transport() = follower.transport()

  fun nowPlaying() = follower.nowPlaying()

  fun press(key: WatchEvent.MediaKey.Key) {
    val controls = follower.transport()
    val audio = getSystemService(AudioManager::class.java)
    when (key) {
      WatchEvent.MediaKey.Key.PLAY -> controls?.play()
      WatchEvent.MediaKey.Key.PAUSE -> controls?.pause()
      WatchEvent.MediaKey.Key.PREVIOUS -> controls?.skipToPrevious()
      WatchEvent.MediaKey.Key.NEXT -> controls?.skipToNext()
      WatchEvent.MediaKey.Key.VOLUME_UP ->
        audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
      WatchEvent.MediaKey.Key.VOLUME_DOWN ->
        audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
    }
    if (controls == null && key in TRANSPORT) {
      WatchEvents.emit("media_key_unused", "${key.name.lowercase()} pressed on the watch, but nothing is playing on the phone")
    }
  }

  fun dismiss(id: Int) {
    posted.remove(id)?.let { cancelNotification(it.key) }
  }

  fun open(id: Int) {
    val sbn = posted[id] ?: return
    try {
      sbn.notification.contentIntent?.send()
    } catch (failure: PendingIntent.CanceledException) {
      WatchEvents.emit("open_on_phone_failed", "the notification can no longer be opened: ${failure.message}")
    }
  }

  companion object {
    private const val BODY_LIMIT = 500
    private const val REMEMBERED = 128
    private val TRANSPORT = setOf(
      WatchEvent.MediaKey.Key.PLAY,
      WatchEvent.MediaKey.Key.PAUSE,
      WatchEvent.MediaKey.Key.PREVIOUS,
      WatchEvent.MediaKey.Key.NEXT
    )
    @Volatile var active: WatchNotificationListener? = null
      private set

    private val posted: MutableMap<Int, StatusBarNotification> = Collections.synchronizedMap(
      object : LinkedHashMap<Int, StatusBarNotification>() {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Int, StatusBarNotification>?): Boolean =
          size > REMEMBERED
      }
    )

    fun idOf(sbn: StatusBarNotification): Int = sbn.key.hashCode() and Int.MAX_VALUE

    private fun remember(id: Int, sbn: StatusBarNotification) {
      posted[id] = sbn
    }
  }
}
