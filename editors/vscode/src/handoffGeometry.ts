/**
 * Geometry contract for a panel-to-native Fumo handoff.
 * All values here are webview CSS pixels; none are global Wayland coordinates.
 * Pure functions: do not access the compositor, native windows, or process APIs.
 */
export interface HandoffGeometry {
    readonly stageViewportLeft: number;
    readonly stageViewportTop: number;
    readonly grabX: number;
    readonly grabY: number;
    readonly spriteWidth: number;
    readonly spriteHeight: number;
    readonly devicePixelRatio: number;
}

export interface LocalHandoff {
    readonly pointerStageX: number;
    readonly pointerStageY: number;
    readonly spriteOriginStageX: number;
    readonly spriteOriginStageY: number;
}

/** Reject malformed webview messages instead of propagating NaN or huge values. */
export function parseHandoffGeometry(value: unknown): HandoffGeometry | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) { return; }
    const data = value as Record<string, unknown>;
    const keys = ['stageViewportLeft', 'stageViewportTop', 'grabX', 'grabY',
        'spriteWidth', 'spriteHeight', 'devicePixelRatio'] as const;
    if (keys.some(key => typeof data[key] !== 'number' || !Number.isFinite(data[key]))) { return; }
    const geometry = data as unknown as HandoffGeometry;
    if (Math.abs(geometry.stageViewportLeft) > 32768 || Math.abs(geometry.stageViewportTop) > 32768 ||
        geometry.spriteWidth < 1 || geometry.spriteWidth > 2000 ||
        geometry.spriteHeight < 1 || geometry.spriteHeight > 2000 ||
        geometry.grabX < -2 || geometry.grabX > geometry.spriteWidth + 2 ||
        geometry.grabY < -2 || geometry.grabY > geometry.spriteHeight + 2 ||
        geometry.devicePixelRatio < 0.5 || geometry.devicePixelRatio > 8) { return; }
    return geometry;
}

/**
 * Convert an event's viewport-relative pointer coordinate into stage coordinates.
 * Retain the point within the grabbed sprite to prevent a visible transfer jump.
 * Does NOT resolve VS Code's global position, the output, or a compositor scale.
 */
export function deriveLocalHandoff(
    viewportX: number,
    viewportY: number,
    geometry: HandoffGeometry
): LocalHandoff {
    const pointerStageX = viewportX - geometry.stageViewportLeft;
    const pointerStageY = viewportY - geometry.stageViewportTop;
    return {
        pointerStageX,
        pointerStageY,
        spriteOriginStageX: pointerStageX - geometry.grabX,
        spriteOriginStageY: pointerStageY - geometry.grabY
    };
}
