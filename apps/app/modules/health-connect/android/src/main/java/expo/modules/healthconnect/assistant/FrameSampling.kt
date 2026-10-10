package expo.modules.healthconnect.assistant

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class FrameSampling : Record {
  @Field var sourceCode: Int = 0
  @Field var longEdge: Int = 768
  @Field var quality: Double = 0.6
  @Field var minIntervalMs: Int = 1000
  @Field var maxBytes: Int = 400_000
  @Field var live: Boolean = true
}
