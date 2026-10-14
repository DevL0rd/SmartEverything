@file:OptIn(ExperimentalMindfulnessSessionApi::class)

package expo.modules.healthconnect

import android.content.Context
import android.os.RemoteException
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.feature.ExperimentalMindfulnessSessionApi
import androidx.health.connect.client.permission.HealthPermission
import java.io.IOException
import kotlinx.coroutines.CancellationException

class Access(
  val types: List<RecordType>,
  val writeTypes: List<RecordType>,
  val background: Boolean,
  val history: Boolean
) {
  fun toMap(): Map<String, Any> = mapOf(
    "types" to types.map { it.name },
    "writeTypes" to writeTypes.map { it.name },
    "background" to background,
    "history" to history
  )
}

object HealthConnectAccess {
  const val BACKGROUND = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
  const val HISTORY = HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY

  private val featureNames = mapOf(
    "backgroundRead" to HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND,
    "historyRead" to HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY,
    "skinTemperature" to HealthConnectFeatures.FEATURE_SKIN_TEMPERATURE,
    "plannedExercise" to HealthConnectFeatures.FEATURE_PLANNED_EXERCISE,
    "mindfulnessSession" to HealthConnectFeatures.FEATURE_MINDFULNESS_SESSION
  )

  fun sdkLabel(status: Int): String = when (status) {
    HealthConnectClient.SDK_AVAILABLE -> "available"
    HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "provider_update_required"
    HealthConnectClient.SDK_UNAVAILABLE -> "unavailable"
    else -> throw UnmappedValue("SDK status", status)
  }

  fun client(context: Context): HealthConnectClient {
    val status = HealthConnectClient.getSdkStatus(context)
    if (status != HealthConnectClient.SDK_AVAILABLE) {
      throw HealthConnectNotAvailable(sdkLabel(status))
    }
    return HealthConnectClient.getOrCreate(context)
  }

  fun offers(client: HealthConnectClient, feature: Int): Boolean =
    client.features.getFeatureStatus(feature) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

  fun readableTypes(client: HealthConnectClient): List<RecordType> =
    RecordTypes.all.filter { type -> type.feature == null || offers(client, type.feature) }

  fun status(context: Context): Map<String, Any> {
    val sdk = sdkLabel(HealthConnectClient.getSdkStatus(context))
    if (sdk != "available") {
      return mapOf("sdk" to sdk)
    }
    val client = HealthConnectClient.getOrCreate(context)
    val features = featureNames.mapValues { (_, feature) ->
      if (offers(client, feature)) "available" else "unavailable"
    }
    return mapOf(
      "sdk" to sdk,
      "features" to features,
      "readableTypes" to readableTypes(client).map { it.name }
    )
  }

  suspend fun grants(client: HealthConnectClient): Access {
    val granted = call { client.permissionController.getGrantedPermissions() }
    return Access(
      types = readableTypes(client).filter { it.readPermission in granted },
      writeTypes = readableTypes(client).filter { it.writePermission in granted },
      background = BACKGROUND in granted &&
        offers(client, HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND),
      history = HISTORY in granted &&
        offers(client, HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY)
    )
  }

  fun allPermissionsFor(client: HealthConnectClient): Set<String> {
    val types = readableTypes(client)
    val reads = permissionsFor(
      client,
      types,
      offers(client, HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND),
      offers(client, HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY)
    )
    return reads + types.map { it.writePermission }
  }

  fun permissionsFor(
    client: HealthConnectClient,
    types: List<RecordType>,
    background: Boolean,
    history: Boolean
  ): Set<String> {
    val readable = readableTypes(client)
    val wanted = types.map { type ->
      if (type !in readable) throw FeatureNotAvailable("the ${type.name} record type")
      type.readPermission
    }.toMutableSet()
    if (background) {
      requireFeature(client, HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND, "background reads")
      wanted.add(BACKGROUND)
    }
    if (history) {
      requireFeature(client, HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY, "history reads")
      wanted.add(HISTORY)
    }
    return wanted
  }

  private fun requireFeature(client: HealthConnectClient, feature: Int, name: String) {
    if (!offers(client, feature)) {
      throw FeatureNotAvailable(name)
    }
  }

  suspend fun <T> call(block: suspend () -> T): T = try {
    block()
  } catch (cancelled: CancellationException) {
    throw cancelled
  } catch (refused: IllegalStateException) {
    throw HealthConnectQuotaExceeded(refused)
  } catch (failure: RemoteException) {
    throw HealthConnectInterrupted(failure)
  } catch (failure: IOException) {
    throw HealthConnectInterrupted(failure)
  } catch (denied: SecurityException) {
    throw HealthConnectDenied(denied)
  }
}
