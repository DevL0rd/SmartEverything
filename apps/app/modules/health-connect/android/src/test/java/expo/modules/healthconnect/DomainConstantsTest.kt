package expo.modules.healthconnect

import expo.modules.healthconnect.push.PushCommands
import expo.modules.healthconnect.watch.xiaomi.XiaomiSports
import org.junit.Assert.assertEquals
import org.junit.Test

class DomainConstantsTest {
  @Test
  fun `every watch sport the domain offers has a Xiaomi code and no other sport has one`() {
    val declared = requireNotNull(XiaomiSports.declared("miwear.watch.p62g", "Xiaomi Watch S5"))
    assertEquals(DomainConstants.WATCH_SPORTS.toSet(), XiaomiSports.offered(declared.codes).toSet())
  }

  @Test
  fun `every push command the domain names has a handler and no other has one`() {
    val named = setOf(
      DomainConstants.PUSH_COMMAND_PHONE_ACTION,
      DomainConstants.PUSH_COMMAND_MACHINE_APPROVAL,
      DomainConstants.PUSH_COMMAND_MACHINE_APPROVAL_CANCEL,
      DomainConstants.PUSH_COMMAND_WATCH_ACTION,
      DomainConstants.PUSH_COMMAND_TREADMILL_ACTION,
      DomainConstants.PUSH_COMMAND_AI_SPEECH,
      DomainConstants.PUSH_COMMAND_AI_RING,
      DomainConstants.PUSH_COMMAND_AI_RING_CANCEL
    )
    assertEquals(named, PushCommands.HANDLERS.keys)
  }
}
