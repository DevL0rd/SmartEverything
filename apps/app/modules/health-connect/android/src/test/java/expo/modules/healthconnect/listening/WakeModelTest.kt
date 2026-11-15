package expo.modules.healthconnect.listening

import java.io.File
import java.nio.file.Files
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WakeModelTest {
  private val directory: File = Files.createTempDirectory("wake-model").toFile()
  private val stamp = File(directory, "installed-build")

  @After
  fun clean() {
    directory.deleteRecursively()
  }

  private fun installAll() {
    listOf(WakeModel.ENCODER, WakeModel.DECODER, WakeModel.JOINER, WakeModel.TOKENS).forEach { File(directory, it).writeText("x") }
  }

  @Test
  fun `the copied model stays while the app build is unchanged`() {
    installAll()
    stamp.writeText("100")
    assertTrue(WakeModel.current(directory, stamp, "100"))
  }

  @Test
  fun `a new app build copies the model again`() {
    installAll()
    stamp.writeText("100")
    assertFalse(WakeModel.current(directory, stamp, "200"))
  }

  @Test
  fun `a missing stamp or file copies the model again`() {
    installAll()
    assertFalse(WakeModel.current(directory, stamp, "100"))
    stamp.writeText("100")
    File(directory, WakeModel.JOINER).delete()
    assertFalse(WakeModel.current(directory, stamp, "100"))
  }
}
