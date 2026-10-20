package expo.modules.healthconnect.watch

import expo.modules.healthconnect.BluetoothConnectNotAllowed
import expo.modules.healthconnect.CompanionScreenUnavailable
import expo.modules.healthconnect.R
import expo.modules.healthconnect.UnsupportedWatchFamily
import expo.modules.healthconnect.WatchNotConfigured
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import expo.modules.healthconnect.ServiceStartRefused
import expo.modules.healthconnect.phone.PhoneUnlock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

class WatchService : Service() {
  private val thread = HandlerThread("smarteverything-watch").apply { start() }
  private val handler = Handler(thread.looper)
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val connections = mutableMapOf<String, WatchConnection>()
  private val attempts = mutableMapOf<String, Int>()
  private val connectedIds = mutableSetOf<String>()
  private val retrying = mutableSetOf<String>()
  private var live = false
  private var lastStartId = 0
  private val lastSyncAt = mutableMapOf<String, Long>()
  private val reportedSyncAt = mutableMapOf<String, String>()
  private var lastDataAt = 0L
  private val unlock = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      handler.post { syncDue("phone unlocked") }
    }
  }
  private val clock = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      WatchActions.send(WatchAction.SetTime())
    }
  }
  private val calls by lazy { CallRelay(this) }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    foreground("Connecting to your watch")
    PhoneUnlock.register(this)
    registerReceiver(unlock, IntentFilter(Intent.ACTION_USER_PRESENT))
    registerReceiver(clock, IntentFilter().apply {
      addAction(Intent.ACTION_TIME_CHANGED)
      addAction(Intent.ACTION_TIMEZONE_CHANGED)
    })
    calls.register()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    lastStartId = startId
    foreground(summary())
    val action = intent?.action ?: ACTION_CONNECT
    val address = intent?.getStringExtra(EXTRA_ADDRESS)
    val deviceId = intent?.getStringExtra(EXTRA_DEVICE)
    val on = intent?.getBooleanExtra(EXTRA_ON, false) ?: false
    handler.post { handle(action, address, deviceId, on) }
    return START_STICKY
  }

  override fun onDestroy() {
    unregisterReceiver(unlock)
    unregisterReceiver(clock)
    calls.unregister()
    handler.post {
      connections.forEach { (id, connection) -> detach(id, connection) }
      connections.clear()
    }
    handler.post { thread.quitSafely() }
    scope.cancel()
    super.onDestroy()
  }

  private fun handle(action: String, address: String?, deviceId: String?, on: Boolean) {
    when (action) {
      ACTION_CONNECT -> connectAll(address)
      ACTION_PAUSE -> deviceId?.let { pause(it, on) }
      ACTION_LIVE -> setLive(on)
      ACTION_REFRESH -> connections.values.forEach { it.refresh() }
      ACTION_SYNC -> syncAll("asked in the app")
      ACTION_STOP -> stopAll()
    }
  }

  private fun connectAll(address: String?) {
    val store = WatchStore(this)
    val active = store.active()
    dropUnwanted(active)
    val wanted = active.filter { address == null || it.address == address.uppercase() }
    wanted.filter { !connections.containsKey(it.deviceId) }.forEach { connect(it) }
    if (connections.isEmpty() && active.isEmpty()) {
      stopSelfResult(lastStartId)
    }
  }

  private fun dropUnwanted(active: List<WatchConfig>) {
    connections.keys.filter { id -> active.none { it.deviceId == id } }.forEach { id ->
      connections.remove(id)?.let { detach(id, it) }
      connectedIds.remove(id)
      attempts.remove(id)
      WatchEvents.emit("watch_released", "no longer bridged by this app", mapOf("deviceId" to id))
    }
  }

  private fun connect(watch: WatchConfig) {
    val monitor = WatchMonitor(this, watch, scope, { changed(watch, it) }) { reason, retryable ->
      handler.post { lost(watch, reason, retryable) }
    }
    if (!WatchPermissions.connectAllowed(this)) {
      monitor.failed(BluetoothConnectNotAllowed().message.orEmpty(), false)
      return
    }
    try {
      val connection = WatchFamilies.named(watch.family).connect(WatchContext(this, watch, monitor, handler))
      connections[watch.deviceId] = connection
      WatchActions.attach(watch.deviceId, connection)
      connection.start()
      connection.setLive(live)
    } catch (failure: UnsupportedWatchFamily) {
      monitor.failed(failure.message.orEmpty(), false)
    }
  }

  private fun changed(watch: WatchConfig, snapshot: WatchSnapshot) {
    val wasConnected = connectedIds.contains(watch.deviceId)
    if (snapshot.phase == WatchPhase.CONNECTED) {
      attempts.remove(watch.deviceId)
      connectedIds.add(watch.deviceId)
      if (!wasConnected) handler.post {
        refreshData()
        syncOne(watch.deviceId, "watch connected")
      }
    } else {
      connectedIds.remove(watch.deviceId)
    }
    WatchActions.setReady(watch.deviceId, snapshot.phase == WatchPhase.CONNECTED)
    val reported = snapshot.lastSyncAt
    if (reported != null && reportedSyncAt.put(watch.deviceId, reported) != reported) {
      lastSyncAt[watch.deviceId] = System.currentTimeMillis()
    }
    foreground(summary())
  }

  private fun syncOne(deviceId: String, reason: String) {
    lastSyncAt[deviceId] = System.currentTimeMillis()
    connections[deviceId]?.sync(reason)
  }

  private fun refreshData() {
    lastDataAt = System.currentTimeMillis()
    WatchHubData.refresh(this)
  }

  private fun syncAll(reason: String) {
    refreshData()
    connections.keys.toList().forEach { syncOne(it, reason) }
  }

  private fun syncDue(reason: String) {
    val now = System.currentTimeMillis()
    if (connections.isNotEmpty() && now - lastDataAt >= UNLOCK_SYNC_GAP_MS) refreshData()
    connections.keys.filter { now - (lastSyncAt[it] ?: 0L) >= UNLOCK_SYNC_GAP_MS }.forEach { syncOne(it, reason) }
  }

  private fun lost(watch: WatchConfig, reason: String, retryable: Boolean) {
    connections.remove(watch.deviceId)?.let { detach(watch.deviceId, it) }
    val attempt = (attempts[watch.deviceId] ?: 0) + 1
    attempts[watch.deviceId] = attempt
    if (!retryable || attempt > RETRY_DELAYS_MS.size || WatchStore(this).paused(watch.deviceId)) {
      retrying.remove(watch.deviceId)
      WatchEvents.emit("gave_up", "$reason; waiting for the watch to come back in range or for the app", mapOf("deviceId" to watch.deviceId))
      stopWhenIdle()
      return
    }
    val delay = RETRY_DELAYS_MS[attempt - 1]
    retrying.add(watch.deviceId)
    WatchEvents.emit("retry_scheduled", "try $attempt in ${delay / 1000} s after: $reason", mapOf("deviceId" to watch.deviceId))
    handler.postDelayed({
      retrying.remove(watch.deviceId)
      if (!connections.containsKey(watch.deviceId)) connectAll(watch.address)
    }, delay)
  }

  private fun stopWhenIdle() {
    if (connections.isNotEmpty() || retrying.isNotEmpty()) return
    if (WatchStore(this).active().any { !WatchCompanion.associated(this, it.address) }) return
    WatchEvents.emit("service_idle", "no watch is connected or retrying; the service stops until the watch is back in range")
    stopSelfResult(lastStartId)
  }

  private fun pause(deviceId: String, paused: Boolean) {
    val store = WatchStore(this)
    store.setPaused(deviceId, paused)
    attempts.remove(deviceId)
    val watch = store.watches().firstOrNull { it.deviceId == deviceId } ?: return
    if (paused) {
      connections.remove(deviceId)?.let { detach(deviceId, it) }
      WatchMonitor(this, watch, scope, { foreground(summary()) }) { _, _ -> }.paused()
      if (connections.isEmpty()) stopSelfResult(lastStartId)
    } else {
      connect(watch)
    }
  }

  private fun setLive(on: Boolean) {
    live = on
    connections.values.forEach { it.setLive(on) }
  }

  private fun detach(deviceId: String, connection: WatchConnection) {
    WatchActions.detach(deviceId, connection)
    connection.stop()
  }

  private fun stopAll() {
    connections.forEach { (id, connection) -> detach(id, connection) }
    connections.clear()
    stopSelfResult(lastStartId)
  }

  private fun summary(): String {
    val snapshots = WatchStore(this).watches().map { WatchSnapshots.of(it) }
    return snapshots.joinToString(" · ") { snapshot ->
      val battery = snapshot.battery?.let { " $it%" }.orEmpty()
      "${snapshot.name}: ${snapshot.phase.label}$battery"
    }.ifEmpty { "No watches set up" }
  }

  private fun foreground(text: String) {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Watch connection", NotificationManager.IMPORTANCE_MIN))
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    val notification = Notification.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle("Watch")
      .setContentText(text)
      .setOngoing(true)
      .setContentIntent(open)
      .build()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (failure: SecurityException) {
      WatchEvents.emit("service_refused", "Android refused the watch connection service: ${failure.message}")
      stopSelf()
    } catch (failure: IllegalStateException) {
      WatchEvents.emit("service_refused", "Android did not let the watch connection service run in the foreground now: ${failure.message}")
      stopSelf()
    }
  }

  companion object {
    const val ACTION_CONNECT = "expo.modules.healthconnect.watch.CONNECT"
    const val ACTION_PAUSE = "expo.modules.healthconnect.watch.PAUSE"
    const val ACTION_LIVE = "expo.modules.healthconnect.watch.LIVE"
    const val ACTION_REFRESH = "expo.modules.healthconnect.watch.REFRESH"
    const val ACTION_STOP = "expo.modules.healthconnect.watch.STOP"
    const val ACTION_SYNC = "expo.modules.healthconnect.watch.SYNC"
    private const val UNLOCK_SYNC_GAP_MS = 15 * 60_000L
    const val EXTRA_ADDRESS = "address"
    const val EXTRA_DEVICE = "deviceId"
    const val EXTRA_ON = "on"
    private const val CHANNEL = "smarteverything.watch"
    private const val NOTIFICATION_ID = 7402
    private val RETRY_DELAYS_MS = longArrayOf(30_000L, 60_000L, 120_000L, 240_000L, 480_000L)

    fun send(context: Context, action: String, extras: Intent.() -> Unit = {}) {
      val intent = Intent(context, WatchService::class.java).setAction(action).apply(extras)
      try {
        context.startForegroundService(intent)
      } catch (failure: IllegalStateException) {
        throw ServiceStartRefused("the watch connection service", failure)
      }
    }
  }
}
