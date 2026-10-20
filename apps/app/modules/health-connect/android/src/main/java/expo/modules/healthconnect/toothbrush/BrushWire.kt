@file:OptIn(ExperimentalSerializationApi::class)

package expo.modules.healthconnect.toothbrush

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator

@Serializable
@JsonClassDiscriminator("kind")
sealed interface Step {
  @Serializable
  @SerialName("write")
  class Write(val service: String, val characteristic: String, val hex: String, val writeType: String) : Step

  @Serializable
  @SerialName("condor_frame")
  class CondorFrame(val hex: String) : Step

  @Serializable
  @SerialName("read")
  class Read(val service: String, val characteristic: String) : Step
}

@Serializable
class Subscription(val service: String, val characteristic: String, val mode: String)

@Serializable
class ReadPlace(val service: String, val characteristic: String)

@Serializable
class AdvertFilter(val companyId: Int)

@Serializable
class LinkPlan(
  val deviceId: String,
  val address: String,
  val transport: String,
  val brand: String,
  val bonded: Boolean,
  val adverts: AdvertFilter?,
  val prepare: List<Step>,
  val subscriptions: List<Subscription>,
  val reads: List<ReadPlace>,
  val sync: List<ReadPlace>,
  val initial: List<Step>,
  val policy: String,
  val holder: Boolean
) {
  val condor: Boolean get() = transport == "condor"
}

@Serializable
class PhoneBrushes(val brushes: List<LinkPlan>)

@Serializable
class BrushFrame(val at: String, val characteristic: String, val hex: String)

@Serializable
class BrushAdvert(val at: String, val rssi: Int, val hex: String)

@Serializable
class LinkReport(val phase: String, val rssi: Int?, val detail: String?)

@Serializable
class FrameBatch(val frames: List<BrushFrame>, val link: LinkReport, val adverts: List<BrushAdvert>? = null)

@Serializable
class FetchEntry(val sessionId: Int, val steps: List<Step>)

@Serializable
class TransferPlan(val completeOn: String?, val cancel: Step?, val deadlineMs: Int)

@Serializable
class BatchResult(val live: Boolean, val accepted: Int, val fetch: List<FetchEntry>, val transfer: TransferPlan?)
