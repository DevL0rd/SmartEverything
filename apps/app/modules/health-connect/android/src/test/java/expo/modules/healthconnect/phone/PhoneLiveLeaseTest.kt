package expo.modules.healthconnect.phone

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import expo.modules.healthconnect.MemoryPreferences
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import io.mockk.verify
import org.junit.After
import org.junit.Test

class PhoneLiveLeaseTest {
  @After
  fun tearDown() {
    unmockkAll()
  }

  @Test
  fun `the live lease is armed with an alarm that also fires while the phone dozes`() {
    val alarms = mockk<AlarmManager>(relaxed = true)
    val context = mockk<Context>(relaxed = true)
    every { context.applicationContext } returns context
    every { context.getSharedPreferences(any(), any()) } returns MemoryPreferences()
    every { context.getSystemService(AlarmManager::class.java) } returns alarms
    mockkStatic(PendingIntent::class)
    every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()
    mockkObject(PhoneDetailRegistry, PhoneReporter)
    every { PhoneDetailRegistry.sources } returns emptyList()
    every { PhoneReporter.report(any(), any(), any(), any()) } returns Unit
    PhoneStore(context).setEnabled(true)
    PhoneLive.set(context, true)
    verify(exactly = 1) { alarms.setAndAllowWhileIdle(AlarmManager.RTC, any(), any()) }
    verify(exactly = 0) { alarms.set(any<Int>(), any<Long>(), any<PendingIntent>()) }
    PhoneLive.set(context, false)
  }
}
