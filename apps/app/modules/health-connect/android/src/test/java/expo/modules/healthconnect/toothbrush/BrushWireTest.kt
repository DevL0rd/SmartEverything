package expo.modules.healthconnect.toothbrush

import expo.modules.healthconnect.BleWatch
import expo.modules.healthconnect.HubJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BrushWireTest {
  private val plan = """
    {"brushes":[{"deviceId":"11111111-1111-4111-8111-111111111111","address":"24:E5:AA:00:00:03","transport":"gatt","brand":"sonicare","bonded":false,"adverts":null,
    "prepare":[{"kind":"write","service":"477ea600-a260-11e4-ae37-0002a5d50005","characteristic":"477ea600-a260-11e4-ae37-0002a5d54120","hex":"0300","writeType":"with_response"}],
    "subscriptions":[{"service":"477ea600-a260-11e4-ae37-0002a5d50002","characteristic":"477ea600-a260-11e4-ae37-0002a5d54090","mode":"notify"}],
    "reads":[{"service":"0000180f-0000-1000-8000-00805f9b34fb","characteristic":"00002a19-0000-1000-8000-00805f9b34fb"}],
    "sync":[],
    "initial":[{"kind":"read","service":"477ea600-a260-11e4-ae37-0002a5d50001","characteristic":"477ea600-a260-11e4-ae37-0002a5d54022"},{"kind":"condor_frame","hex":"feff010000"}],
    "policy":"on_demand","holder":true}]}
  """.trimIndent()

  private val result = """
    {"live":true,"accepted":2,"fetch":[{"sessionId":335,"steps":[{"kind":"write","service":"477ea600-a260-11e4-ae37-0002a5d50004","characteristic":"477ea600-a260-11e4-ae37-0002a5d540d5","hex":"00","writeType":"with_response"}]}],
    "transfer":{"completeOn":"477ea600-a260-11e4-ae37-0002a5d54110","cancel":{"kind":"write","service":"477ea600-a260-11e4-ae37-0002a5d50004","characteristic":"477ea600-a260-11e4-ae37-0002a5d54110","hex":"02","writeType":"with_response"},"deadlineMs":6000}}
  """.trimIndent()

  @Test
  fun `reads the plan the hub writes with each kind of step`() {
    val brush = HubJson.decode<PhoneBrushes>(plan).brushes.single()
    assertEquals("gatt", brush.transport)
    assertEquals("sonicare", brush.brand)
    assertNull(brush.adverts)
    assertTrue(brush.sync.isEmpty())
    assertTrue(brush.holder)
    assertTrue(brush.prepare.single() is Step.Write)
    assertTrue(brush.initial[0] is Step.Read)
    assertEquals("feff010000", (brush.initial[1] as Step.CondorFrame).hex)
    assertEquals("0300", (brush.prepare[0] as Step.Write).hex)
  }

  @Test
  fun `reads what the hub answers to a batch of frames`() {
    val answer = HubJson.decode<BatchResult>(result)
    assertEquals(335, answer.fetch.single().sessionId)
    assertEquals(6000, answer.transfer?.deadlineMs)
    assertEquals("02", (answer.transfer?.cancel as Step.Write).hex)
  }

  @Test
  fun `reads a plain gatt plan with adverts and a post session read list`() {
    val oralb = """
      {"brushes":[{"deviceId":"22222222-2222-4222-8222-222222222222","address":"A4:C1:38:00:00:01","transport":"gatt","brand":"oralb","bonded":false,
      "adverts":{"companyId":220},"prepare":[],"subscriptions":[],
      "reads":[{"service":"a0f0ff00-5047-4d53-8208-4f72616c2d42","characteristic":"a0f0ff02-5047-4d53-8208-4f72616c2d42"}],
      "sync":[{"service":"a0f0ff00-5047-4d53-8208-4f72616c2d42","characteristic":"a0f0ff05-5047-4d53-8208-4f72616c2d42"}],
      "initial":[],"policy":"on_demand","holder":true}]}
    """.trimIndent()
    val brush = HubJson.decode<PhoneBrushes>(oralb).brushes.single()
    assertEquals("oralb", brush.brand)
    assertEquals(220, brush.adverts?.companyId)
    assertEquals(1, brush.sync.size)
    assertTrue(!brush.condor)
  }

  @Test
  fun `writes adverts only when a batch carries them`() {
    val link = LinkReport("linked", null, null)
    assertTrue(!HubJson.encode(FrameBatch(emptyList(), link)).contains("adverts"))
    val text = HubJson.encode(FrameBatch(emptyList(), link, listOf(BrushAdvert("2026-10-18T10:00:00Z", -60, "01020304"))))
    assertTrue(text.contains("\"adverts\":[{\"at\":\"2026-10-18T10:00:00Z\",\"rssi\":-60,\"hex\":\"01020304\"}]"))
  }

  @Test
  fun `writes a batch the hub accepts`() {
    val batch = FrameBatch(listOf(BrushFrame("2026-10-18T10:00:00Z", "2a19", "50")), LinkReport("linked", -50, null))
    val text = HubJson.encode(batch)
    assertTrue(text.contains("\"phase\":\"linked\""))
    assertTrue(text.contains("\"characteristic\":\"2a19\""))
  }

  @Test
  fun `reads a watch with and without content filters`() {
    val plain = HubJson.decode<BleWatch>("""{"devices":[]}""")
    assertTrue(plain.contentFilters.isEmpty())
    val withFilters = HubJson.decode<BleWatch>(
      """{"devices":[],"contentFilters":[{"serviceUuid":"477ea600-a260-11e4-ae37-0002a5d50001"},{"companyId":477,"dataPrefix":"436f6e646f72","dataMask":"ffffffffffff"}]}"""
    )
    assertEquals(2, withFilters.contentFilters.size)
    assertEquals(477, withFilters.contentFilters[1].companyId)
    assertNull(withFilters.contentFilters[0].companyId)
  }
}
