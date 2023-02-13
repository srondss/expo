// Copyright 2022-present 650 Industries. All rights reserved.

#pragma once

#ifdef __cplusplus

#ifdef ANDROID
#include <folly/dynamic.h>
#include <react/renderer/mapbuffer/MapBuffer.h>
#include <react/renderer/mapbuffer/MapBufferBuilder.h>
#endif

namespace ABI48_0_0expo {

class ExpoViewState final {
public:
  ExpoViewState() {};

#ifdef ANDROID
  ExpoViewState(ExpoViewState const &previousState, folly::dynamic data) {};

  folly::dynamic getDynamic() const {
    return {};
  };

  ABI48_0_0facebook::ABI48_0_0React::MapBuffer getMapBuffer() const {
    return ABI48_0_0facebook::ABI48_0_0React::MapBufferBuilder::EMPTY();
  };
#endif

};

} // namespace ABI48_0_0expo

#endif // __cplusplus
