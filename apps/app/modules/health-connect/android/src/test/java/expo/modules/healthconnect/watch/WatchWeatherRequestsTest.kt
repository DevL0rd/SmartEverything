package expo.modules.healthconnect.watch

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Test

class WatchWeatherRequestsTest {
  @Test
  fun requestsInOneBurstFetchAndDeliverOnlyOnce() = runBlocking {
    val current = snapshot(1)
    val next = snapshot(2)
    val firstRead = CompletableDeferred<WatchWeatherSnapshot>()
    val answers = mutableListOf<WatchWeather>()
    var reads = 0
    val requests = WatchWeatherRequests(this, { if (++reads == 1) firstRead.await() else next }, {}) {
      answers.add(it)
    }

    requests.request()
    yield()
    requests.request()
    requests.request()
    assertEquals(1, reads)
    assertEquals(emptyList<WatchWeather>(), answers)

    firstRead.complete(current)
    yield()
    assertEquals(listOf(current.weather), answers)

    requests.request()
    yield()
    assertEquals(listOf(current.weather, next.weather), answers)
  }

  @Test
  fun anAnswerCannotReachTheDisconnectedSession() = runBlocking {
    val hub = CompletableDeferred<WatchWeatherSnapshot>()
    val answers = mutableListOf<WatchWeather>()
    val requests = WatchWeatherRequests(this, { hub.await() }, {}) { answers.add(it) }

    requests.request()
    yield()
    requests.cancel()
    hub.complete(snapshot(1))
    yield()
    assertEquals(emptyList<WatchWeather>(), answers)
  }

  @Test
  fun anOlderBackgroundPushCannotOverwriteTheWatchReply() = runBlocking {
    val older = snapshot(1)
    val newer = snapshot(2)
    val answers = mutableListOf<WatchWeather>()
    val requests = WatchWeatherRequests(this, { newer }, {}) { answers.add(it) }

    requests.request()
    yield()
    requests.deliver(older)
    assertEquals(listOf(newer.weather), answers)
  }

  @Test
  fun anOlderWatchReplyCannotOverwriteTheBackgroundPush() = runBlocking {
    val newer = snapshot(2)
    val hub = CompletableDeferred<WatchWeatherSnapshot>()
    val answers = mutableListOf<WatchWeather>()
    val requests = WatchWeatherRequests(this, { hub.await() }, {}) { answers.add(it) }

    requests.request()
    yield()
    requests.deliver(newer)
    hub.complete(snapshot(1))
    yield()
    assertEquals(listOf(newer.weather), answers)
  }

  @Test
  fun anUnavailableBackgroundResultSupersedesOlderWeatherWithoutAnswering() = runBlocking {
    val unavailable = WatchWeatherSnapshot(2, null)
    val answers = mutableListOf<WatchWeather>()
    val requests = WatchWeatherRequests(this, { snapshot(1) }, {}) { answers.add(it) }

    requests.deliver(unavailable)
    requests.request()
    yield()
    assertEquals(emptyList<WatchWeather>(), answers)
  }

  @Test
  fun aWatchRequestCanDeliverASnapshotVersionAlreadySent() = runBlocking {
    val cached = snapshot(1)
    val answers = mutableListOf<WatchWeather>()
    val requests = WatchWeatherRequests(this, { cached }, {}) { answers.add(it) }

    requests.deliver(cached)
    requests.request()
    yield()
    assertEquals(listOf(cached.weather, cached.weather), answers)
  }

  private fun snapshot(version: Long): WatchWeatherSnapshot =
    WatchWeatherSnapshot(
      version,
      WatchWeather(
        "Home", "UTC", "2026-11-06T04:16:00Z",
        WeatherNow(0, 20, 50, 0.0, null, null, null, "Unknown", null),
        emptyList(), emptyList()
      )
    )
}
