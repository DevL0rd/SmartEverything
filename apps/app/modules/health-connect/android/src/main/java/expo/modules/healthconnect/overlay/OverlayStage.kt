package expo.modules.healthconnect.overlay

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import expo.modules.healthconnect.Credentials
import expo.modules.healthconnect.assistant.AssistantCalls
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.json.JSONObject

interface OverlaySessionHost {
  fun show(view: OverlayViewState)

  fun handOver()

  fun openApp(action: String?)
}

object OverlayStage {
  val levels = OverlayLevels()
  val actions: OverlayActions = Commands

  private val main = Handler(Looper.getMainLooper())
  private val recompute = Runnable { refresh() }
  private var context: Context? = null
  private var surface: OverlaySurfaceFacts? = null
  private var windows: OverlayWindows? = null
  private var prefs = OverlayPhonePrefs()
  private var facts: CallFacts? = null
  private var wake: OverlayWake? = null
  private var onCallPage = false
  private var session: OverlaySessionHost? = null
  private var thinking: OverlayThinking? = null

  @Volatile
  var host = OverlayHostKind.None
    private set

  @Volatile
  private var barOn = false

  fun ensure(context: Context) = onMain {
    if (this.context != null) return@onMain
    val app = context.applicationContext
    this.context = app
    prefs = OverlayPrefs.load(app)
    windows = OverlayWindows(app, actions, levels)
    thinking = OverlayThinking(
      HubThinking { Credentials(app).load() },
      CoroutineScope(SupervisorJob() + Dispatchers.IO),
      { block -> onMain(block) },
    ) { refresh() }
    surface = OverlaySurfaceFacts(app) { refresh() }
    refresh()
  }

  fun barAvailable(): Boolean = barOn

  fun keepsSession(): Boolean = surface?.let { OverlayHostRule.sessionKeeps(it.locked, canDraw()) } == true

  fun prefs(next: OverlayPhonePrefs) = onMain {
    prefs = next
    refresh()
  }

  fun callPage(on: Boolean) = onMain {
    onCallPage = on
    refresh()
  }

  fun wake(muted: Boolean) = onMain {
    wake = OverlayWake(System.currentTimeMillis(), null, muted)
    refresh()
  }

  fun call(change: (CallFacts?) -> CallFacts?) = onMain {
    val before = facts
    facts = change(before)
    followThinking(before, facts)
    refresh()
  }

  fun message(callId: String, message: JSONObject) = call { current ->
    if (current?.callId == callId) CallOverlayState.message(current, message, System.currentTimeMillis()) else current
  }

  fun notice(notice: CallNoticeFacts) = call { current -> current?.let { CallOverlayState.notice(it, notice) } }

  fun dismiss() = onMain {
    if (facts?.over == true) facts = null
    wake = null
    refresh()
  }

  fun attachSession(next: OverlaySessionHost) {
    main.post {
      session = next
      refresh()
    }
  }

  fun detachSession(gone: OverlaySessionHost) {
    main.post {
      if (session === gone) session = null
      refresh()
    }
  }

  fun openApp(action: String? = null) = onMain {
    val current = session
    if (current != null) current.openApp(action) else context?.let { AssistantCalls.openCallPage(it, action) }
  }

  fun resetPosition() = onMain {
    windows?.resetPlacement()
  }

  fun toggleCaptions() = onMain {
    val app = context ?: return@onMain
    prefs = OverlayPrefs.store(app, prefs.copy(captions = !prefs.captions))
    refresh()
  }

  private fun followThinking(before: CallFacts?, after: CallFacts?) {
    if (after == null || after.over) return
    if (after.callId != before?.callId) thinking?.load()
    if (after.phase == CallPhase.Reconnecting && before?.phase != CallPhase.Reconnecting) thinking?.reconnected()
  }

  private fun refresh() {
    val seen = surface ?: return
    main.removeCallbacks(recompute)
    val now = System.currentTimeMillis()
    val view = overlayView(CallOverlayState.inputOf(facts, wake, prefs.data, mainOf(seen.foreground), now, thinking?.voice(facts?.callId)))
    val canDraw = canDraw()
    barOn = OverlayHostRule.barAvailable(prefs.enabled, canDraw)
    host = OverlayHostRule.hostFor(OverlayHostFacts(view.state != OverlayState.Hidden, seen.locked, seen.screenOn, canDraw, session != null))
    drive(view, seen.screenOn)
    if (view.state == OverlayState.Hidden) settle() else schedule(view.changesAt, now)
  }

  private fun drive(view: OverlayViewState, screenOn: Boolean) {
    val window = windows ?: return
    if (host == OverlayHostKind.Window && !window.render(view, prefs)) host = OverlayHostKind.None
    if (host != OverlayHostKind.Window) {
      if (screenOn) window.hide() else window.removeNow()
    }
    val current = session ?: return
    if (host == OverlayHostKind.Session) current.show(view) else current.handOver()
  }

  private fun settle() {
    if (facts?.over == true) facts = null
    if (facts == null) wake = null
    if (facts == null) levels.clear()
  }

  private fun schedule(changesAt: Long?, now: Long) {
    val at = changesAt ?: return
    main.postAtTime(recompute, SystemClock.uptimeMillis() + maxOf(0L, at - now))
  }

  private fun mainOf(foreground: Boolean): MainWindow = when {
    !foreground -> MainWindow.Away
    onCallPage -> MainWindow.Call
    else -> MainWindow.Other
  }

  private fun canDraw(): Boolean = context?.let(Settings::canDrawOverlays) == true

  private fun onMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
  }

  private object Commands : OverlayActions {
    override fun onControl(control: OverlayControl) {
      context?.let { AssistantCalls.command(it, control) }
    }

    override fun onOpen() = openApp()

    override fun onTile(tile: OverlayTile) {
      context?.let { AssistantCalls.tile(it, tile) }
    }

    override fun onThinking(level: VoiceLevel) {
      thinking?.choose(level, facts?.callId)
    }
  }
}
