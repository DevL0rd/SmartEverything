package expo.modules.healthconnect.voice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.IBinder
import expo.modules.healthconnect.talk.HeadsetButton
import expo.modules.healthconnect.talk.TalkClient
import expo.modules.healthconnect.talk.TalkEvents
import expo.modules.healthconnect.talk.TalkNotice
import expo.modules.healthconnect.talk.TalkStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class VoiceService : Service() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
  private var talk: TalkClient? = null
  private var headset: HeadsetButton? = null
  private val network = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) {
      scope.launch { talk?.reconnect() }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    foreground(TalkNotice.build(this, TalkEvents.state.value))
    getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(network)
    scope.launch {
      TalkEvents.state.collect { state ->
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, TalkNotice.build(this@VoiceService, state))
      }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val action = intent?.action ?: ACTION_START
    if (action == ACTION_STOP) {
      TalkStore(this).setEnabled(false)
      stopSelf()
      return START_NOT_STICKY
    }
    val client = talk ?: TalkClient(this).also {
      talk = it
      it.start()
    }
    handle(client, action, intent)
    return START_STICKY
  }

  private fun handle(client: TalkClient, action: String, intent: Intent?) {
    when (action) {
      ACTION_PRESS -> intent?.getStringExtra(EXTRA_CHANNEL)?.let { client.press(it) }
      ACTION_LISTEN -> {
        val channel = intent?.getStringExtra(EXTRA_CHANNEL)
        val camera = intent?.getStringExtra(EXTRA_CAMERA)
        if (channel != null && camera != null) client.listen(channel, camera)
      }
      ACTION_RELEASE -> client.release()
      ACTION_TOGGLE -> client.toggle()
      ACTION_NEXT -> client.nextChannel()
      ACTION_CHANNELS -> client.channelsChanged()
      ACTION_HEADSET -> applyHeadset(client)
    }
  }

  private fun applyHeadset(client: TalkClient) {
    headset?.release()
    headset = if (TalkStore(this).headset()) HeadsetButton(this) { client.toggle() } else null
  }

  override fun onDestroy() {
    getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(network)
    headset?.release()
    talk?.stop()
    talk = null
    scope.cancel()
    super.onDestroy()
  }

  private fun foreground(notification: Notification) {
    getSystemService(NotificationManager::class.java)
      .createNotificationChannel(NotificationChannel(CHANNEL, "Walkie-talkie", NotificationManager.IMPORTANCE_LOW))
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        )
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (failure: SecurityException) {
      TalkNotice.reopen(this)
      stopSelf()
    }
  }

  companion object {
    const val CHANNEL = "smarteverything.talk"
    const val NOTIFICATION_ID = 7410
    const val ACTION_START = "expo.modules.healthconnect.voice.START"
    const val ACTION_STOP = "expo.modules.healthconnect.voice.STOP"
    const val ACTION_PRESS = "expo.modules.healthconnect.voice.PRESS"
    const val ACTION_LISTEN = "expo.modules.healthconnect.voice.LISTEN"
    const val ACTION_RELEASE = "expo.modules.healthconnect.voice.RELEASE"
    const val ACTION_TOGGLE = "expo.modules.healthconnect.voice.TOGGLE"
    const val ACTION_NEXT = "expo.modules.healthconnect.voice.NEXT"
    const val ACTION_CHANNELS = "expo.modules.healthconnect.voice.CHANNELS"
    const val ACTION_HEADSET = "expo.modules.healthconnect.voice.HEADSET"
    const val EXTRA_CHANNEL = "channelId"
    const val EXTRA_CAMERA = "cameraId"

    fun intent(context: Context, action: String): Intent =
      Intent(context, VoiceService::class.java).setAction(action)

    fun send(context: Context, action: String, extras: Intent.() -> Unit = {}) {
      context.startForegroundService(intent(context, action).apply(extras))
    }

    fun pending(context: Context, action: String, code: Int): PendingIntent =
      PendingIntent.getForegroundService(context, code, intent(context, action), PendingIntent.FLAG_IMMUTABLE)
  }
}
