#pragma once

#include <fbjni/fbjni.h>

namespace jni = facebook::jni;

namespace expo {

class AmplitudeProcessor : public jni::HybridClass<AmplitudeProcessor> {
public:
  static constexpr auto kJavaDescriptor =
    "Lexpo/modules/audio/AmplitudeProcessor;";
  static auto constexpr TAG = "AmplitudeProcessorNative";

  static void registerNatives();

  jni::local_ref<jni::JArrayFloat>
  extractAmplitudesNative(jni::alias_ref<jni::JArrayByte> chunk, jint size);

private:
  explicit AmplitudeProcessor(
    jni::alias_ref<AmplitudeProcessor::jhybridobject> jThis)
    : javaPart_(jni::make_global(jThis)) {}

private:
  static jni::local_ref<jhybriddata>
  initHybrid(jni::alias_ref<jhybridobject> jThis);

  friend HybridBase;
  jni::global_ref<AmplitudeProcessor::javaobject> javaPart_;
};

} // namespace expo