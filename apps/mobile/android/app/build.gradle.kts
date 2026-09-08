plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val releaseSigningNames = listOf("PD_KEYSTORE_FILE", "PD_KEYSTORE_PASSWORD", "PD_KEY_ALIAS", "PD_KEY_PASSWORD")
val releaseSigning = releaseSigningNames.associateWith { System.getenv(it) }
if (releaseSigning.values.any { !it.isNullOrBlank() } && releaseSigning.values.any { it.isNullOrBlank() }) {
    throw GradleException("Provide all four PD_KEYSTORE/KEY environment settings for release signing.")
}
val hasReleaseSigning = releaseSigning.values.all { !it.isNullOrBlank() }

android {
    namespace = "com.pocketdoctor.pocket_doctor"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Provisional identifier; confirm ownership before store distribution.
        applicationId = "com.pocketdoctor.pocket_doctor"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("production") {
                storeFile = file(releaseSigning["PD_KEYSTORE_FILE"]!!)
                storePassword = releaseSigning["PD_KEYSTORE_PASSWORD"]
                keyAlias = releaseSigning["PD_KEY_ALIAS"]
                keyPassword = releaseSigning["PD_KEY_PASSWORD"]
            }
        }
    }
    buildTypes {
        release {
            isDebuggable = false
            if (hasReleaseSigning) signingConfig = signingConfigs.getByName("production")
            // Without private signing configuration, only an unsigned build is possible.
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
