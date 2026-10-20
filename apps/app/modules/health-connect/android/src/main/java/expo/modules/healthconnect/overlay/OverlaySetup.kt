package expo.modules.healthconnect.overlay

object ThinkingCopy {
  const val SECTION = "Thinking"
  const val GROUP = "Thinking level"
  const val SAVING = "Saving…"
  const val LOADING = "Loading thinking setting…"
  const val LOAD_FAILED = "Could not load the thinking setting. Check the connection and try again."
  const val FAILED = "Could not save. Check the connection and try again."
  const val RECONNECT = "Applies after the call reconnects. To use it now, start a new call."

  val LEVELS = listOf(VoiceLevel.Off, VoiceLevel.Low, VoiceLevel.Medium, VoiceLevel.High)

  fun name(level: VoiceLevel): String =
    when (level) {
      VoiceLevel.Off -> "Off"
      VoiceLevel.Low -> "Low"
      VoiceLevel.Medium -> "Medium"
      VoiceLevel.High -> "High"
    }

  fun shortNote(level: VoiceLevel): String =
    when (level) {
      VoiceLevel.Off -> "Fastest. Answers right away."
      VoiceLevel.Low -> "Thinks a little first, then answers."
      VoiceLevel.Medium -> "Thinks longer on hard questions."
      VoiceLevel.High -> "Smartest and slowest."
    }

  fun chipLabel(level: VoiceLevel): String = if (level == VoiceLevel.Off) "Thinking off" else "Thinking: ${name(level)}"
}

private fun noteOf(voice: OverlayVoice, level: VoiceLevel?): String =
  when {
    level == null -> ThinkingCopy.LOAD_FAILED
    voice.failed -> ThinkingCopy.FAILED
    voice.changedInCall && !voice.saving -> ThinkingCopy.RECONNECT
    else -> ThinkingCopy.shortNote(level)
  }

private fun stateOf(voice: OverlayVoice): SetupState =
  when {
    voice.failed -> SetupState.Failed
    voice.saving -> SetupState.Saving
    else -> SetupState.Ready
  }

fun setupOf(voice: OverlayVoice?): OverlaySetup {
  if (voice == null) return OverlaySetup(null, SetupState.Loading, ThinkingCopy.LOADING)
  return OverlaySetup(voice.thinkingLevel, stateOf(voice), noteOf(voice, voice.thinkingLevel))
}

fun chipOf(voice: OverlayVoice?): OverlayChip? {
  val level = voice?.thinkingLevel ?: return null
  val label = ThinkingCopy.chipLabel(level)
  return OverlayChip(level, label, "$label. Open thinking settings.", voice.saving || voice.failed)
}
