package expo.modules.healthconnect.push

import expo.modules.healthconnect.DomainConstants
import expo.modules.healthconnect.HubJson
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MachineApprovalPayloadTest {
  @Test
  fun `the approval the hub pushes is read with its machine and who asked`() {
    val text = """{"approval":{"action":"unlock","machine":"Desk","source":"assistant"},"requestId":"3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73","expiresAt":"2026-10-18T10:01:00.000Z"}"""
    val payload = mapOf(DomainConstants.PUSH_PAYLOAD_KEY to text).pushPayload<MachineApprovalPayload>()
    assertEquals("unlock", payload.approval.action)
    assertEquals("Desk", payload.approval.machine)
    assertEquals("assistant", payload.approval.source)
    assertEquals(Instant.parse("2026-10-18T10:01:00Z"), payload.expiresAt)
  }

  @Test
  fun `an answer carries a screenshot only when there is one`() {
    val plain = HubJson.encode(ActionAnswer("3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73", true, "Locked"))
    assertFalse(plain.contains("image"))
    val shot = HubJson.encode(ActionAnswer("3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73", true, "Took a screenshot", "AAAA"))
    assertTrue(shot.contains("\"image\":\"AAAA\""))
  }
}
