/**
 * Internal status event for an editor-decoration flight. The message type is
 * retained for compatibility with the stable webview reply/restore protocol;
 * it does NOT represent a native OS overlay.
 */
export interface HandoffStatusMessage {
    readonly type: 'handoffOverlayStatus';
    readonly requestId: string;
    readonly id: string;
    readonly status: 'active' | 'returned' | 'failed';
}
