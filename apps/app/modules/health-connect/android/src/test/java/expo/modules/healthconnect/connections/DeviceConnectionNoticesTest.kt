package expo.modules.healthconnect.connections

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeviceConnectionNoticesTest {
  @Test
  fun combinesReadyDevicesWithPendingConnectionsWithoutCountingThePendingDevice() {
    val notices = Recorder()
    notices.connections.start("watch service")
    notices.connections.update("watch service", listOf(watch))
    notices.connections.start("brush service")
    notices.connections.update("brush service", listOf(brush))
    notices.connections.start("treadmill service")
    notices.connections.update("treadmill service", listOf(DeviceConnection("Treadmill", "connecting", false)))

    notices.publishScheduled()

    assertEquals(
      Display("watch service", "2 devices connected", "Toothbrush: linked · Watch: connected 60% · Treadmill: connecting"),
      notices.displays.last()
    )
  }

  @Test
  fun survivingServiceReceivesUpdatedSummaryWhenAnotherServiceStops() {
    val notices = Recorder()
    notices.connections.start("watch service")
    notices.connections.update("watch service", listOf(watch))
    notices.connections.start("brush service")
    notices.connections.update("brush service", listOf(brush))
    notices.publishScheduled()

    notices.connections.stop("watch service")
    notices.publishScheduled()

    assertEquals(Display("brush service", "1 device connected", "Toothbrush: linked"), notices.displays.last())
    val beforeLastStop = notices.displays.toList()
    notices.connections.update("brush service", emptyList())
    notices.connections.stop("brush service")
    notices.advanceTo(10_000L)
    assertEquals(beforeLastStop, notices.displays)
    assertNull(notices.scheduledAt)
  }

  @Test
  fun survivorRefreshesTheSummaryWhenAndroidNoLongerAcceptsUpdatesFromTheStoppingService() {
    val notices = Recorder()
    notices.connections.start("watch service")
    notices.connections.update("watch service", listOf(watch))
    notices.connections.start("brush service")
    notices.connections.update("brush service", listOf(brush))
    notices.publishScheduled()

    notices.refusedOwner = "watch service"
    notices.connections.update("watch service", emptyList())
    notices.publishScheduled()
    assertEquals("2 devices connected", notices.displays.last().title)
    notices.connections.stop("watch service")
    notices.publishScheduled()

    assertEquals(Display("brush service", "1 device connected", "Toothbrush: linked"), notices.displays.last())
  }

  @Test
  fun callbacksFromStoppedOrRefusedInstancesCannotChangeTheCurrentNotification() {
    val notices = Recorder(refusedOwner = "refused service")
    notices.connections.start("old service")
    notices.connections.update("old service", listOf(watch))
    notices.connections.stop("old service")
    notices.connections.start("replacement service")
    notices.connections.start("refused service")
    val afterStart = notices.displays.toList()

    notices.connections.update("old service", listOf(watch))
    notices.connections.update("refused service", listOf(brush))
    notices.connections.stop("refused service")
    notices.advanceTo(10_000L)

    assertEquals(Display("replacement service", "Device connections", "Waiting for devices"), afterStart.last())
    assertEquals(afterStart, notices.displays)
    assertNull(notices.scheduledAt)
  }

  @Test
  fun keepsOneEntryPerDeviceAndRefreshesOnlyOnConnectionStateChanges() {
    val notices = Recorder()
    notices.connections.start("brush service")
    notices.connections.update("brush service", listOf(brush, brush))
    notices.publishScheduled()
    val beforeDuplicateUpdate = notices.displays.toList()
    notices.connections.update("brush service", listOf(brush, brush))

    assertEquals("2 devices connected", beforeDuplicateUpdate.last().title)
    assertEquals(beforeDuplicateUpdate, notices.displays)
    assertNull(notices.scheduledAt)
    notices.connections.update("brush service", listOf(DeviceConnection("Toothbrush", "asleep", false), brush))
    notices.publishScheduled()
    assertEquals(
      Display("brush service", "1 device connected", "Toothbrush: linked · Toothbrush: asleep"),
      notices.displays.last()
    )
  }

  @Test
  fun coalescesBurstAndDepartureIntoOneLatestPublicationAfterTheLastPromotion() {
    val notices = Recorder()
    notices.connections.start("watch service")
    notices.connections.update("watch service", listOf(watch))
    notices.advanceTo(250L)
    notices.connections.start("brush service")
    notices.connections.update("brush service", listOf(brush))
    notices.advanceTo(500L)
    notices.connections.start("treadmill service")
    notices.connections.update("treadmill service", listOf(DeviceConnection("Treadmill", "linked", true)))
    repeat(64) { charge ->
      notices.connections.update("watch service", listOf(DeviceConnection("Watch", "connected $charge%", true)))
    }
    notices.connections.stop("treadmill service")

    notices.advanceTo(1_499L)
    assertEquals(3, notices.displays.size)
    assertEquals(1_500L, notices.scheduledAt)
    notices.advanceTo(1_500L)

    assertEquals(4, notices.displays.size)
    assertEquals(
      Display("watch service", "2 devices connected", "Toothbrush: linked · Watch: connected 63%"),
      notices.displays.last()
    )
    assertNull(notices.scheduledAt)
  }

  private data class Display(val owner: String, val title: String, val text: String)

  private class Recorder(var refusedOwner: String? = null) {
    private var time = 0L
    private var publication: Pair<Runnable, Long>? = null
    val scheduledAt: Long? get() = publication?.second
    val displays = mutableListOf<Display>()
    val connections = DeviceConnectionNotices<String>(
      { time },
      { task, at -> publication = task to at },
      { task -> if (publication?.first == task) publication = null }
    ) { owner, summary ->
      (owner != refusedOwner).also { accepted ->
        if (accepted) displays.add(Display(owner, summary.title, summary.text))
      }
    }

    fun publishScheduled() = advanceTo(checkNotNull(scheduledAt))

    fun advanceTo(at: Long) {
      time = at
      val scheduled = publication ?: return
      if (scheduled.second > at) return
      publication = null
      scheduled.first.run()
    }
  }

  private companion object {
    val watch = DeviceConnection("Watch", "connected 60%", true)
    val brush = DeviceConnection("Toothbrush", "linked", true)
  }
}
