/**
 * @file handoffProbe.ts
 * @brief Browser drag and editor-decoration flight controller.
 *
 * The webview owns the drag preview. The host manages editor-only flight
 * using the VS Code decoration API; it never launches a native overlay.
 */
import * as vscode from 'vscode';
import { CHARACTER_DEFINITIONS } from './generated/characters';
import type { HandoffStatusMessage } from './editorFlightProtocol';
import { parseHandoffGeometry, type HandoffGeometry } from './handoffGeometry';
import { EditorDecorationFlight } from './editorDecorationFlight';

interface ProbeMessage {
    readonly type: 'handoffProbe';
    readonly gestureId?: string;
    readonly requestId: string;
    readonly id: string;
    readonly phase: 'boundary' | 'release';
    readonly x: number;
    readonly y: number;
    readonly worldWidth: number;
    readonly worldHeight: number;
    readonly vx: number;
    readonly vy: number;
    readonly geometry: HandoffGeometry;
    readonly releasedAtMs: number;
    readonly dragMetrics?: {
        readonly moveEvents: number;
        readonly maxEventDispatchDelayMs: number;
        readonly durationMs: number;
    };
}

interface ProbeAck {
    readonly type: 'handoffProbeAck';
    readonly requestId: string;
    readonly id: string;
    readonly phase: 'boundary' | 'release';
    readonly nativePending?: boolean;
    readonly editorPending?: boolean;
}

function parseProbe(value: unknown): ProbeMessage | undefined {
    if (!value || typeof value !== 'object') { return; }
    const raw = value as Record<string, unknown>;
    if (raw.type !== 'handoffProbe' ||
        typeof raw.requestId !== 'string' || raw.requestId.length > 32 ||
        !/^[0-9]+$/.test(raw.requestId) ||
        typeof raw.id !== 'string' ||
        !CHARACTER_DEFINITIONS.some(item => item.id === raw.id) ||
        (raw.phase !== 'boundary' && raw.phase !== 'release')) { return; }
    const numbers = [raw.x, raw.y, raw.worldWidth, raw.worldHeight, raw.vx, raw.vy, raw.releasedAtMs];
    if (numbers.some(value => typeof value !== 'number' || !Number.isFinite(value))) { return; }
    const width = raw.worldWidth as number;
    const height = raw.worldHeight as number;
    const vx = raw.vx as number;
    const vy = raw.vy as number;
    if (width < 1 || width > 20000 || height < 1 || height > 20000 ||
        Math.abs(vx) > 1500 || Math.abs(vy) > 1500 ||
        Math.abs(Date.now() - (raw.releasedAtMs as number)) > 60000) { return; }
    if (raw.gestureId !== undefined &&
        (typeof raw.gestureId !== 'string' || !/^[0-9]{1,16}$/.test(raw.gestureId))) { return; }
    const geometry = parseHandoffGeometry(raw.geometry);
    if (!geometry) { return; }
    // Telemetry is strictly optional and is never used to approve native execution.
    if (raw.dragMetrics !== undefined) {
        if (!raw.dragMetrics || typeof raw.dragMetrics !== 'object') { return; }
        const d = raw.dragMetrics as Record<string, unknown>;
        if (typeof d.moveEvents !== 'number' || !Number.isInteger(d.moveEvents) ||
            d.moveEvents < 0 || d.moveEvents > 100000 ||
            typeof d.maxEventDispatchDelayMs !== 'number' || !Number.isFinite(d.maxEventDispatchDelayMs) ||
            d.maxEventDispatchDelayMs < 0 || d.maxEventDispatchDelayMs > 1000 ||
            typeof d.durationMs !== 'number' || !Number.isFinite(d.durationMs) ||
            d.durationMs < 0 || d.durationMs > 600000) { return; }
    }
    return { ...raw, geometry } as unknown as ProbeMessage;
}

/** Validates drop messages and starts bounded, editor-only decoration flights. */
export class HandoffProbeController implements vscode.Disposable {
    private readonly output = vscode.window.createOutputChannel('Touhou Fumo');
    private readonly lastByStage = new Map<string, number>();

    private readonly editorFlight: EditorDecorationFlight;

    public constructor(extensionUri: vscode.Uri) {

        this.editorFlight = new EditorDecorationFlight(extensionUri, (line) => this.output.appendLine(line));
    }

    public handle(
        stage: 'Explorer' | 'Bottom Panel',
        value: unknown,
        reply: (message: ProbeAck | HandoffStatusMessage) => void
    ): void {
        const config = vscode.workspace.getConfiguration('touhouFumo');
        if (!config.get<boolean>('physics.enabled', false) ||
            !config.get<boolean>('editorFlight.enabled', false)) { return; }

        const message = parseProbe(value);
        if (!message) { return; }
        // Debounce duplicate drop messages to prevent repeated flights.
        const key = stage + ':' + message.id + ':' + message.phase;
        const now = Date.now();
        if (now - (this.lastByStage.get(key) ?? 0) < 100) { return; }
        this.lastByStage.set(key, now);
        const nativePending = false;
        let editorPending = false;
        if (message.phase === 'release') {
            // Explorer release coordinates provide only an approximate start.
            const beyond = message.x - message.geometry.stageViewportLeft - message.worldWidth;
            const editorXHint = stage === 'Explorer' && Number.isFinite(beyond) &&
                beyond > 0 && beyond < 5000 ? beyond - message.geometry.grabX - 40 : undefined;
            editorPending = this.editorFlight.tryLaunch({
                requestId: message.requestId, id: message.id, vx: message.vx, vy: message.vy,
                editorXHint, sourceStage: stage,
                // Geometry carries the original panel sprite's CSS-pixel size.
                // Never scale the editor Fumo to a separate fixed height.
                spriteWidth: message.geometry.spriteWidth,
                spriteHeight: message.geometry.spriteHeight
            }, reply);
        }
        reply({ type: 'handoffProbeAck', requestId: message.requestId,
            id: message.id, phase: message.phase, nativePending, editorPending });
    }

    public dispose(): void {
        this.editorFlight.dispose();

        this.output.dispose();
        this.lastByStage.clear();
    }
}
