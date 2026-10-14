package expo.modules.healthconnect.talk

import android.content.Context
import expo.modules.healthconnect.configureServer
import expo.modules.healthconnect.voice.VoiceService
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class TalkModule : Module() {
  private var forwarding: Job? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("Talk")

    Events(STATE_EVENT)

    OnStartObserving(STATE_EVENT) {
      forwarding = appContext.backgroundCoroutineScope.launch {
        TalkEvents.state.collect { sendEvent(STATE_EVENT, it.toMap()) }
      }
    }

    OnStopObserving(STATE_EVENT) {
      forwarding?.cancel()
      forwarding = null
    }

    AsyncFunction("configureTalk") { serverUrl: String, token: String, enrollment: String ->
      configureServer(context, serverUrl, token, enrollment)
    }

    AsyncFunction("startTalk") {
      TalkStore(context).setEnabled(true)
      VoiceService.send(context, VoiceService.ACTION_START)
    }

    AsyncFunction("stopTalk") {
      TalkStore(context).setEnabled(false)
      context.stopService(VoiceService.intent(context, VoiceService.ACTION_STOP))
    }

    AsyncFunction("pressTalk") { channelId: String ->
      VoiceService.send(context, VoiceService.ACTION_PRESS) { putExtra(VoiceService.EXTRA_CHANNEL, channelId) }
    }

    AsyncFunction("listenTalk") { channelId: String, cameraId: String ->
      VoiceService.send(context, VoiceService.ACTION_LISTEN) {
        putExtra(VoiceService.EXTRA_CHANNEL, channelId)
        putExtra(VoiceService.EXTRA_CAMERA, cameraId)
      }
    }

    AsyncFunction("releaseTalk") {
      VoiceService.send(context, VoiceService.ACTION_RELEASE)
    }

    AsyncFunction("setTalkChannels") { channelsJson: String, talkChannel: String ->
      TalkStore(context).setChannels(channelsJson, talkChannel)
      if (TalkStore(context).enabled()) {
        VoiceService.send(context, VoiceService.ACTION_CHANNELS)
      }
    }

    AsyncFunction("setHeadsetButton") { on: Boolean ->
      TalkStore(context).setHeadset(on)
      if (TalkStore(context).enabled()) {
        VoiceService.send(context, VoiceService.ACTION_HEADSET)
      }
    }

    AsyncFunction("talkState") {
      TalkEvents.state.value.toMap()
    }
  }

  private companion object {
    const val STATE_EVENT = "onTalkState"
  }
}
