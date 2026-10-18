package expo.modules.healthconnect.calls

import android.app.Activity
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import expo.modules.healthconnect.assistant.AssistantLink

class IncomingCallActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var call: IncomingCall? = null
  private val ended = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.getStringExtra("outreachId") == call?.outreachId) {
        finish()
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val incoming = IncomingCall.fromIntent(intent)
    if (incoming == null || incoming.remainingMs() <= 0) {
      finish()
      return
    }
    call = incoming
    wake()
    registerEnded()
    if (intent.action == IncomingCalls.ACTION_ANSWER) {
      answer(incoming)
      return
    }
    setContentView(layout(incoming))
    handler.postDelayed({ finish() }, incoming.remainingMs())
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    if (call != null) {
      unregisterReceiver(ended)
    }
    super.onDestroy()
  }

  private fun registerEnded() {
    val filter = IntentFilter(IncomingCalls.ACTION_ENDED)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(ended, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      registerReceiver(ended, filter)
    }
  }

  private fun wake() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
  }

  private fun answer(incoming: IncomingCall) {
    IncomingCalls.dismiss(this, incoming.outreachId)
    val open = {
      try {
        startActivity(AssistantLink.answer(this, incoming.chatId, incoming.outreachId))
      } catch (failure: IllegalStateException) {
        Log.e(IncomingCalls.TAG, failure.message.orEmpty())
      }
      finish()
    }
    val keyguard = getSystemService(KeyguardManager::class.java)
    if (keyguard.isKeyguardLocked) {
      keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() = open()
        override fun onDismissCancelled() = finish()
        override fun onDismissError() = finish()
      })
    } else {
      open()
    }
  }

  private fun layout(incoming: IncomingCall): LinearLayout {
    val padding = (32 * resources.displayMetrics.density).toInt()
    return LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(padding, padding, padding, padding)
      addView(TextView(context).apply {
        text = "${incoming.caller} is calling"
        textSize = 26f
        gravity = Gravity.CENTER
      })
      addView(TextView(context).apply {
        text = incoming.reason
        textSize = 17f
        gravity = Gravity.CENTER
        setPadding(0, padding / 2, 0, padding)
      })
      addView(Button(context).apply {
        text = "Answer"
        setOnClickListener { answer(incoming) }
      })
      addView(Button(context).apply {
        text = "Decline"
        setOnClickListener {
          IncomingCalls.decline(context, incoming.outreachId)
          finish()
        }
      })
    }
  }
}
