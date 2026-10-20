package expo.modules.healthconnect.overlay

import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.IngestTarget
import expo.modules.healthconnect.diagnostics.NativeLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

interface ThinkingHub {
  suspend fun read(): VoiceLevel

  suspend fun write(level: VoiceLevel): VoiceLevel
}

@Serializable
private data class VoiceBody(@SerialName("thinking_level") val level: VoiceLevel)

@Serializable
private data class SettingsBody(val voice: VoiceBody)

@Serializable
private data class StatusBody(val settings: SettingsBody)

@Serializable
private data class ChangeBody(val voice: VoiceBody)

class HubThinking(private val target: () -> IngestTarget) : ThinkingHub {
  override suspend fun read(): VoiceLevel = HubClient(target()).get<StatusBody>(STATUS).settings.voice.level

  override suspend fun write(level: VoiceLevel): VoiceLevel =
    HubClient(target()).patch<ChangeBody, StatusBody>(SETTINGS, ChangeBody(VoiceBody(level))).settings.voice.level

  private companion object {
    const val STATUS = "/api/assistant"
    const val SETTINGS = "/api/assistant/settings"
  }
}

class OverlayThinking(
  private val hub: ThinkingHub,
  private val scope: CoroutineScope,
  private val onMain: (() -> Unit) -> Unit,
  private val changed: () -> Unit,
) {
  private var level: VoiceLevel? = null
  private var chosen: VoiceLevel? = null
  private var pending = 0
  private var failed = false
  private var changedCall: String? = null

  fun voice(callId: String?): OverlayVoice =
    OverlayVoice(if (pending > 0) chosen ?: level else level, pending > 0, failed, callId != null && changedCall == callId)

  fun load() {
    scope.launch {
      val result = runCatching { hub.read() }
      result.exceptionOrNull()?.let { NativeLog.warn(SCOPE, "thinking.read_failed", it) }
      onMain {
        level = result.getOrNull() ?: level
        failed = result.isFailure
        changed()
      }
    }
  }

  fun choose(next: VoiceLevel, callId: String?) {
    pending += 1
    failed = false
    chosen = next
    changed()
    scope.launch {
      val result = runCatching { hub.write(next) }
      result.exceptionOrNull()?.let { NativeLog.warn(SCOPE, "thinking.write_failed", it) }
      onMain {
        pending -= 1
        failed = result.isFailure
        result.getOrNull()?.let {
          level = it
          changedCall = callId
        }
        changed()
      }
    }
  }

  fun reconnected() {
    if (changedCall == null) return
    changedCall = null
    changed()
  }

  private companion object {
    const val SCOPE = "overlay"
  }
}
