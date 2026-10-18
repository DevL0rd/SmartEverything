package expo.modules.healthconnect.listening

import android.content.Context
import java.io.File
import java.io.IOException

object WakeModel {
  const val ASSET_DIRECTORY = "wake-name-model"
  const val ENCODER = "encoder.int8.onnx"
  const val DECODER = "decoder.int8.onnx"
  const val JOINER = "joiner.int8.onnx"
  const val TOKENS = "tokens.txt"

  private val FILES = listOf(ENCODER, DECODER, JOINER, TOKENS)

  fun install(context: Context): File {
    val directory = File(context.filesDir, ASSET_DIRECTORY)
    directory.mkdirs()
    for (name in FILES) {
      val target = File(directory, name)
      val size = context.assets.openFd("$ASSET_DIRECTORY/$name").use { it.length }
      if (!target.isFile || target.length() != size) {
        copy(context, name, target)
      }
    }
    return directory
  }

  fun vocabulary(directory: File): Set<String> = KeywordLines.vocabularyOf(File(directory, TOKENS).readText())

  private fun copy(context: Context, name: String, target: File) {
    val partial = File(target.parentFile, "$name.partial")
    context.assets.open("$ASSET_DIRECTORY/$name").use { input ->
      partial.outputStream().use { input.copyTo(it) }
    }
    if (!partial.renameTo(target)) {
      throw IOException("could not install ${target.name}")
    }
  }
}
