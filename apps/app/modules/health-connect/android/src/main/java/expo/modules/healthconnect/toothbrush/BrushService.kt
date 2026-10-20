package expo.modules.healthconnect.toothbrush

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
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.R
import expo.modules.healthconnect.ServiceStartRefused
import expo.modules.healthconnect.toHex
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.oralb.OralbMatch
import expo.modules.healthconnect.sonicare.CondorTransport
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class BrushService : Service() {
  private val thread = HandlerThread("smarteverything-toothbrush").apply { start() }
  private val handler = Handler(thread.looper)
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val sessions = HashMap<String, Session>()
  private var lastStartId = 0
  private var uploading = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    foreground("Looking for your toothbrush")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    lastStartId = startId
    foreground(summary())
    val action = intent?.action ?: ACTION_CONNECT
    val address = intent?.getStringExtra(EXTRA_ADDRESS)
    handler.post { handle(action, address) }
    return START_NOT_STICKY
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
      ACTION_CONNECT -> connectAll(address, false)
      ACTION_SYNC -> connectAll(address, true)
      ACTION_REFRESH -> refreshPlans()
      ACTION_STOP -> stopAll()
    }
  }

  private fun connectAll(address: String?, sync: Boolean) {
    if (!BrushPermissions.connectAllowed(this)) {
      NativeLog.warn(SCOPE, "connect.refused") { mapOf("reason" to "nearby devices permission missing") }
      stopSelfResult(lastStartId)
      return
    }
    val wanted = BrushStore(this).holding()
      .filter { address == null || it.condor || it.address.equals(address, ignoreCase = true) }
      .filter { !sync || it.sync.isNotEmpty() }
    wanted.filter { !sessions.containsKey(it.deviceId) }.forEach { plan ->
      val session = Session(plan, sync)
      sessions[plan.deviceId] = session
      session.start()
    }
    if (sessions.isEmpty()) stopSelfResult(lastStartId)
  }

  private fun refreshPlans() {
    scope.launch {
      try {
        BrushBridge.fetch(this@BrushService)
        handler.post { connectAll(null, false) }
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

  private fun sessionEnded(session: Session) {
    sessions.remove(session.plan.deviceId)
    if (sessions.isEmpty()) {
      BrushUpload.resume(this)
      stopSelfResult(lastStartId)
    }
  }

  private fun holderLost(session: Session) {
    sessions.remove(session.plan.deviceId)?.stop()
    BrushOutbox.forget(this, session.plan.deviceId)
    refreshPlans()
  }

  private fun upload() {
    if (uploading) return
    uploading = true
    scope.launch {
      try {
        BrushUpload.drain(
          this@BrushService,
          object : UploadSink {
            override fun accepted(deviceId: String, result: BatchResult) {
              handler.post { sessions[deviceId]?.accept(result) }
            }

            override fun conflict(deviceId: String) {
              handler.post { sessions[deviceId]?.let { holderLost(it) } }
            }
          }
        )
      } finally {
        uploading = false
      }
    }
  }

  private fun summary(): String =
    BrushStore(this).plans().joinToString(" · ") { plan ->
      "${plan.address}: ${sessions[plan.deviceId]?.phase ?: "waiting"}"
    }.ifEmpty { "No toothbrush set up" }

  private fun foreground(text: String) {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Toothbrush connection", NotificationManager.IMPORTANCE_MIN))
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    val notification = Notification.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle("Toothbrush")
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

  private inner class Session(val plan: LinkPlan, sync: Boolean) : BrushListener {
    private val loop = HandlerLoop(handler)
    private val link = BrushLink(
      { BrushGatt(this@BrushService, loop, it) },
      loop,
      plan,
      OralbMatch.watch(this@BrushService, plan, this),
      sync
    )
    private val bursty = burstyOf(plan)
    private val frames = ArrayList<BrushFrame>()
    private val fetches = ArrayDeque<FetchEntry>()
    private var transfer: TransferPlan? = null
    private var fetching: Int? = null
    private var lastFlushAt = 0L
    private var lastReported = ""
    private val deadline = Runnable { transferExpired() }
    var phase = "asleep"
      private set
    private var detail: String? = null

    fun start() {
      BrushLinks.attach(plan.deviceId, link)
      link.start()
    }

    fun stop() {
      BrushLinks.detach(plan.deviceId, link)
      handler.removeCallbacks(deadline)
      link.close()
      phase = "asleep"
      detail = null
      flush()
    }

    fun accept(result: BatchResult) {
      if (result.fetch.isEmpty()) return
      transfer = result.transfer
      fetches.addAll(result.fetch)
      nextFetch()
    }

    override fun phase(phase: String, detail: String?) {
      this.phase = phase
      this.detail = detail
      foreground(summary())
      flush()
    }

    override fun ended() {
      handler.removeCallbacks(deadline)
      BrushLinks.detach(plan.deviceId, link)
      flush()
      sessionEnded(this)
    }

    override fun notified(characteristic: String, value: ByteArray) {
      frames.add(BrushFrame(Instant.now().toString(), characteristic, value.toHex()))
      if (characteristic == transfer?.completeOn && fetching != null) fetchDone()
      val now = android.os.SystemClock.elapsedRealtime()
      if (characteristic !in bursty || now - lastFlushAt >= BURST_MS) flush()
    }

    private fun nextFetch() {
      if (fetching != null) return
      val entry = fetches.removeFirstOrNull() ?: return
      val plan = transfer ?: return
      fetching = entry.sessionId
      handler.postDelayed(deadline, plan.deadlineMs.toLong())
      link.run(entry.steps) { ok, detail ->
        if (!ok) NativeLog.warn(SCOPE, "fetch.refused") { mapOf("session" to entry.sessionId, "detail" to detail) }
        if (plan.completeOn == null || !ok) fetchDone()
      }
    }

    private fun fetchDone() {
      handler.removeCallbacks(deadline)
      fetching = null
      nextFetch()
    }

    private fun transferExpired() {
      val cancel = transfer?.cancel
      NativeLog.warn(SCOPE, "fetch.expired") { mapOf("session" to fetching) }
      fetching = null
      if (cancel != null) link.run(listOf(cancel)) { _, _ -> nextFetch() } else nextFetch()
    }

    private fun flush() {
      lastFlushAt = android.os.SystemClock.elapsedRealtime()
      if (frames.isEmpty() && phase == lastReported) return
      lastReported = phase
      val batch = FrameBatch(frames.toList(), LinkReport(phase, link.rssi, detail))
      frames.clear()
      BrushOutbox.remember(this@BrushService, plan.deviceId, HubJson.encode(batch))
      upload()
    }
  }

  companion object {
    const val ACTION_CONNECT = "expo.modules.healthconnect.toothbrush.CONNECT"
    const val ACTION_REFRESH = "expo.modules.healthconnect.toothbrush.REFRESH"
    const val ACTION_SYNC = "expo.modules.healthconnect.toothbrush.SYNC"
    const val ACTION_STOP = "expo.modules.healthconnect.toothbrush.STOP"
    const val EXTRA_ADDRESS = "address"
    private const val SCOPE = "toothbrush"
    private const val CHANNEL = "smarteverything.sonicare"
    private const val NOTIFICATION_ID = 7407
    private const val BURST_MS = 1_000L
    private val SONICARE_BURSTY = setOf(
      "477ea600-a260-11e4-ae37-0002a5d54090",
      "477ea600-a260-11e4-ae37-0002a5d54130",
      CondorTransport.TX
    )
    private val ORALB_BURSTY = setOf(
      "a0f0ff08-5047-4d53-8208-4f72616c2d42",
      "a0f0ff09-5047-4d53-8208-4f72616c2d42",
      "a0f0ff0b-5047-4d53-8208-4f72616c2d42"
    )

    fun burstyOf(plan: LinkPlan): Set<String> = if (plan.brand == "oralb") ORALB_BURSTY else SONICARE_BURSTY

    fun send(context: Context, action: String, address: String? = null) {
      val intent = Intent(context, BrushService::class.java).setAction(action).also { intent ->
        address?.let { intent.putExtra(EXTRA_ADDRESS, it) }
      }
      try {
        context.startForegroundService(intent)
      } catch (failure: IllegalStateException) {
        throw ServiceStartRefused("the toothbrush connection service", failure)
      }
    }
  }
}
