package expo.modules.healthconnect.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PhonePostWorkerTagTest {
  @Test
  fun `a body file is found again from its work tag and other tags name no file`() {
    assertEquals("0a1b", PhonePostWorker.fileOfTag("${PhonePostWorker.BODY_FILE_TAG}:0a1b"))
    assertNull(PhonePostWorker.fileOfTag(PhonePostWorker.BODY_FILE_TAG))
    assertNull(PhonePostWorker.fileOfTag("expo.modules.healthconnect.phone.PhonePostWorker"))
  }
}
