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
  private const val STAMP = "installed-build"

  private val FILES = listOf(ENCODER, DECODER, JOINER, TOKENS)

  fun install(context: Context): File {
    val directory = File(context.filesDir, ASSET_DIRECTORY)
    directory.mkdirs()
    val stamp = File(directory, STAMP)
    val build = context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime.toString()
    if (current(directory, stamp, build)) {
      return directory
    }
    stamp.delete()
    for (name in FILES) {
      copy(context, name, File(directory, name))
    }
    stamp.writeText(build)
    return directory
  }

  fun current(directory: File, stamp: File, build: String): Boolean =
    stamp.isFile && stamp.readText() == build && FILES.all { File(directory, it).isFile }

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
