package expo.modules.healthconnect.voice

class VoiceCaptureUnavailable(reason: String) :
  Exception("The microphone could not be opened for the walkie-talkie: $reason")

class OpusUnavailable(reason: String) :
  Exception("This phone has no Opus audio codec the walkie-talkie can use: $reason")
