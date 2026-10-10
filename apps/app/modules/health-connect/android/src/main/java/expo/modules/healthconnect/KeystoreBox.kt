package expo.modules.healthconnect

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class KeystoreBox(private val alias: String) {
  fun seal(plain: String): String {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val sealed = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(sealed, Base64.NO_WRAP)
  }

  fun open(encoded: String): String {
    try {
      val sealed = Base64.decode(encoded, Base64.NO_WRAP)
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, sealed, 0, NONCE_BYTES))
      return String(cipher.doFinal(sealed, NONCE_BYTES, sealed.size - NONCE_BYTES), Charsets.UTF_8)
    } catch (failure: GeneralSecurityException) {
      throw StoredCredentialUnreadable(failure)
    } catch (failure: IllegalArgumentException) {
      throw StoredCredentialUnreadable(failure)
    }
  }

  private fun key(): SecretKey {
    val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    val existing = store.getKey(alias, null)
    if (existing is SecretKey) {
      return existing
    }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(KEY_BITS)
        .build()
    )
    return generator.generateKey()
  }

  private companion object {
    const val KEYSTORE = "AndroidKeyStore"
    const val TRANSFORMATION = "AES/GCM/NoPadding"
    const val KEY_BITS = 256
    const val TAG_BITS = 128
    const val NONCE_BYTES = 12
  }
}
