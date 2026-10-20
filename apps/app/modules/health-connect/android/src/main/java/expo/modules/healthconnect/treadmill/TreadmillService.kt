package expo.modules.healthconnect.treadmill

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.IngestRejected
import expo.modules.healthconnect.IngestUnavailable
import expo.modules.healthconnect.R
import expo.modules.healthconnect.ServiceStartRefused
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.relayTarget
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class TreadmillService : Service() {
  private val thread = HandlerThread("smarteverything-treadmill").apply { start() }
  private val handler = Handler(thread.looper)
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val sessions = HashMap<String, LinkSession>()
  private var lastStartId = 0
  private var uploading = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    foreground("Looking for your treadmill")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    lastStartId = startId
    foreground(summary())
    val action = intent?.action ?: ACTION_CONNECT
    val address = intent?.getStringExtra(EXTRA_ADDRESS)
    handler.post { handle(action, address) }
    return START_STICKY
  }

  override fun onDestroy() {
    handler.post {
      sessions.values.forEach { it.stop() }
      sessions.clear()
      thread.quitSafely()
    }
    scope.cancel()
    super.onDestroy()
  }

  private fun handle(action: String, address: String?) {
    when (action) {
      ACTION_CONNECT -> connectAll(address)
      ACTION_LOST -> address?.let { lost(it) }
      ACTION_REFRESH -> refreshPlans()
      ACTION_STOP -> stopAll()
    }
  }

  private fun connectAll(address: String?) {
    if (checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      NativeLog.warn(SCOPE, "connect.refused") { mapOf("reason" to "nearby devices permission missing") }
      stopSelfResult(lastStartId)
      return
    }
    val wanted = TreadmillStore(this).holding().filter { address == null || it.address.equals(address, ignoreCase = true) }
    sessions.keys.filter { id -> wanted.none { it.deviceId == id } }.toList().forEach { sessions.remove(it)?.stop() }
    wanted.filter { !sessions.containsKey(it.deviceId) }.forEach { plan ->
      val session = LinkSession(this, plan)
      sessions[plan.deviceId] = session
      session.start()
    }
    if (sessions.isEmpty()) stopSelfResult(lastStartId)
  }

  private fun lost(address: String) {
    val session = sessions.values.firstOrNull { it.plan.address.equals(address, ignoreCase = true) } ?: return
    if (!session.plan.presence) return
    sessions.remove(session.plan.deviceId)
    session.stop()
    if (sessions.isEmpty()) stopSelfResult(lastStartId)
  }

  private fun refreshPlans() {
    scope.launch {
      try {
        TreadmillBridge.fetch(this@TreadmillService)
        handler.post { connectAll(null) }
      } catch (failure: Exception) {
        NativeLog.warn(SCOPE, "plans.refresh_failed", failure) { mapOf("type" to failure.javaClass.simpleName) }
      }
    }
  }

  private fun stopAll() {
    sessions.values.forEach { it.stop() }
    sessions.clear()
    stopSelfResult(lastStartId)
  }

  fun holderLost(session: LinkSession) {
    sessions.remove(session.plan.deviceId)?.stop()
    TreadmillOutbox.forget(this, session.plan.deviceId)
    refreshPlans()
  }

  fun upload() {
    if (uploading) return
    uploading = true
    scope.launch {
      try {
        drain()
      } finally {
        uploading = false
      }
    }
  }

  private suspend fun drain() {
    val client = HubClient(relayTarget(this))
    while (true) {
      val batch = TreadmillOutbox.peek(this) ?: return
      try {
        val body = HubJson.decode<FrameBatch>(batch.body)
        val result = client.post<FrameBatch, BatchResult>("/api/treadmills/${batch.deviceId}/frames", body)
        TreadmillOutbox.acknowledge(this, batch)
        handler.post { sessions[batch.deviceId]?.live(result.live) }
      } catch (failure: IngestUnavailable) {
        handler.postDelayed({ upload() }, RETRY_UPLOAD_MS)
        return
      } catch (failure: IngestRejected) {
        TreadmillOutbox.acknowledge(this, batch)
        NativeLog.warn(SCOPE, "upload.rejected", failure) { mapOf("status" to failure.status) }
        if (failure.status == CONFLICT) handler.post { sessions[batch.deviceId]?.let { holderLost(it) } }
      }
    }
  }

  private fun summary(): String =
    TreadmillStore(this).plans().joinToString(" · ") { plan ->
      "${plan.address}: ${sessions[plan.deviceId]?.phase ?: "waiting"}"
    }.ifEmpty { "No treadmill set up" }

  fun note() = foreground(summary())

  fun handlerOf(): Handler = handler

  private fun foreground(text: String) {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Treadmill connection", NotificationManager.IMPORTANCE_MIN))
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    val notification = Notification.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle("Treadmill")
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
      NativeLog.warn(SCOPE, "foreground.refused", failure) { mapOf("type" to "security") }
      stopSelf()
    } catch (failure: IllegalStateException) {
      NativeLog.warn(SCOPE, "foreground.refused", failure) { mapOf("type" to "state") }
      stopSelf()
    }
  }

  class LinkSession(private val service: TreadmillService, val plan: LinkPlan) : LinkListener {
    private val handler = service.handlerOf()
    private val coalescer = FrameCoalescer(plan.subscriptions, Instant::now)
    private val link = GattLink(service, handler, plan, this)
    private val frames = ArrayList<TreadmillFrame>()
    private val poller = plan.statusRequest?.let { StatusPoller(it) }
    private var live = false
    private var ticks = 0
    private var ticking = false
    var phase = "not_linked"
      private set
    private var detail: String? = null

    fun start() {
      TreadmillLinks.attach(plan.deviceId, link)
      link.start()
    }

    fun stop() {
      TreadmillLinks.detach(plan.deviceId, link)
      ticking = false
      handler.removeCallbacksAndMessages(null)
      link.close()
      phase = "not_linked"
      detail = null
      flush()
    }

    fun live(on: Boolean) {
      live = on
    }

    override fun phase(phase: String, detail: String?) {
      this.phase = phase
      this.detail = detail
      service.note()
      flush()
      if (phase == "linked" && !ticking) {
        ticking = true
        handler.postDelayed({ tick() }, TICK_MS)
      }
    }

    override fun notified(characteristic: String, value: ByteArray) {
      poller?.heard(value)
      val immediate = coalescer.accept(characteristic, value)
      if (immediate != null) {
        frames.add(immediate)
        flush()
      }
    }

    private fun tick() {
      if (!ticking || phase != "linked") {
        ticking = false
        return
      }
      ticks += 1
      requestStatus()
      if (live || ticks % BATCH_TICKS == 0) flush()
      handler.postDelayed({ tick() }, TICK_MS)
    }

    override fun commanded() {
      poller?.commanded()
    }

    private fun requestStatus() {
      val request = plan.statusRequest ?: return
      val control = plan.control ?: return
      if (poller?.due(ticks * TICK_MS) != true) return
      link.send(WriteStep(control.characteristic, control.service, request.hex, control.writeType, 0))
    }

    private fun flush() {
      frames.addAll(coalescer.drain())
      if (frames.isEmpty() && phase == lastReported) return
      lastReported = phase
      val batch = FrameBatch(frames.toList(), LinkReport(phase, link.rssi, link.reconnects, detail))
      frames.clear()
      TreadmillOutbox.remember(service, plan.deviceId, HubJson.encode(batch))
      service.upload()
    }

    private var lastReported = ""
  }

  companion object {
    const val ACTION_CONNECT = "expo.modules.healthconnect.treadmill.CONNECT"
    const val ACTION_LOST = "expo.modules.healthconnect.treadmill.LOST"
    const val ACTION_REFRESH = "expo.modules.healthconnect.treadmill.REFRESH"
    const val ACTION_STOP = "expo.modules.healthconnect.treadmill.STOP"
    const val EXTRA_ADDRESS = "address"
    private const val SCOPE = "treadmill"
    private const val CHANNEL = "smarteverything.treadmill"
    private const val NOTIFICATION_ID = 7405
    private const val TICK_MS = 1_000L
    private const val BATCH_TICKS = 5
    private const val RETRY_UPLOAD_MS = 5_000L
    private const val CONFLICT = 409

    fun send(context: Context, action: String, address: String? = null) {
      val intent = Intent(context, TreadmillService::class.java).setAction(action).also { intent ->
        address?.let { intent.putExtra(EXTRA_ADDRESS, it) }
      }
      try {
        context.startForegroundService(intent)
      } catch (failure: IllegalStateException) {
        throw ServiceStartRefused("the treadmill connection service", failure)
      }
    }
  }
}
