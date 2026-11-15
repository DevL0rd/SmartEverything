package expo.modules.healthconnect.drive

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DriveWriteSeedTest {
  @Test
  fun `modes that keep what is there start from the current content`() {
    for (mode in listOf("r", "rw", "wa", "a", "ra", "rwa")) assertTrue(mode, DriveWriteSeed.keepsExisting(mode))
  }

  @Test
  fun `modes that replace or only write start empty`() {
    for (mode in listOf("w", "wt", "rwt", "rt", "wat")) assertFalse(mode, DriveWriteSeed.keepsExisting(mode))
  }
}
