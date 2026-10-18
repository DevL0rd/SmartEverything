package expo.modules.healthconnect

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerEnrollmentStateTest {
  private val hub = "https://hub.example.com"
  private val phone = "a".repeat(64)
  private val tablet = "b".repeat(64)

  @Test fun activatingTheSamePairKeepsTheRecordAndItsTickets() {
    val active = ServerEnrollmentState().activate(hub, phone)
    assertSame(active, active.activate(hub, phone))
    assertTrue(active.admits(active.ticket(hub, phone)))
  }

  @Test fun activatingAnotherPrincipalReplacesTheRecordAndRevokesEarlierTickets() {
    val first = ServerEnrollmentState().activate(hub, phone)
    val ticket = first.ticket(hub, phone)
    val second = first.activate(hub, tablet)
    assertEquals(first.generation + 1, second.generation)
    assertFalse(second.admits(ticket))
    assertThrows(NativeCredentialWithdrawn::class.java) { second.ticket(hub, phone) }
  }

  @Test fun withdrawingTheActivePrincipalClearsTheRecordAndOtherPrincipalsAreIgnored() {
    val active = ServerEnrollmentState().activate(hub, phone)
    assertSame(active, active.withdraw(tablet))
    val cleared = active.withdraw(phone)
    assertEquals(active.generation + 1, cleared.generation)
    assertFalse(cleared.admits(active.ticket(hub, phone)))
    assertSame(cleared, cleared.withdraw(null))
  }

  @Test fun theRecordRoundTripsThroughItsStoredForm() {
    val active = ServerEnrollmentState().activate(hub, phone)
    assertEquals(active, ServerEnrollmentState.parse(active.toJson()))
    assertEquals(ServerEnrollmentState(), ServerEnrollmentState.parse(ServerEnrollmentState().toJson()))
  }

  @Test fun aTicketSurvivesItsJsonForm() {
    val ticket = ServerEnrollmentState().activate(hub, phone).ticket(hub, phone)
    assertEquals(ticket, EnrollmentTicket.parse(ticket.toJson()))
  }
}
