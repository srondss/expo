import { PureComponent, createRef } from 'react';
import NativeVideoModule from './NativeVideoModule';
import NativeVideoView from './NativeVideoView';
/**
 * Returns whether the current device supports Picture in Picture (PiP) mode.
 *
 * > **Note:** All major web browsers, except Firefox, support Picture in Picture (PiP) mode.
 * > For more information, see [MDN web docs](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API#browser_compatibility).
 * @returns A `boolean` which is `true` if the device supports PiP mode, and `false` otherwise.
 */
export function isPictureInPictureSupported() {
    return NativeVideoModule.isPictureInPictureSupported();
}
export class VideoView extends PureComponent {
    nativeRef = createRef();
    /**
     * Enters fullscreen mode.
     */
    enterFullscreen() {
        this.nativeRef.current?.enterFullscreen();
    }
    /**
     * Exits fullscreen mode.
     */
    exitFullscreen() {
        this.nativeRef.current?.exitFullscreen();
    }
    /**
     * Enters Picture in Picture (PiP) mode. Throws an exception if the device does not support PiP.
     * > **Note:** Only one player can be in Picture in Picture (PiP) mode at a time.
     *
     * > **Note:** The `supportsPictureInPicture` property of the [config plugin](#configuration-in-appjsonappconfigjs)
     * > has to be configured for the PiP to work.
     * @platform android
     * @platform ios 14+
     * @platform web
     */
    startPictureInPicture() {
        return this.nativeRef.current?.startPictureInPicture();
    }
    /**
     * Exits Picture in Picture (PiP) mode.
     * @platform android
     * @platform ios 14+
     * @platform web
     */
    stopPictureInPicture() {
        return this.nativeRef.current?.stopPictureInPicture();
    }
    render() {
        const { player, ...props } = this.props;
        const playerId = getPlayerId(player);
        return <NativeVideoView {...props} player={playerId} ref={this.nativeRef}/>;
    }
}
// Temporary solution to pass the shared object ID instead of the player object.
// We can't really pass it as an object in the old architecture.
// Technically we can in the new architecture, but it's not possible yet.
function getPlayerId(player) {
    if (player instanceof NativeVideoModule.VideoPlayer) {
        // @ts-expect-error
        return player.__expo_shared_object_id__;
    }
    if (typeof player === 'number') {
        return player;
    }
    return null;
}
//# sourceMappingURL=VideoView.js.map