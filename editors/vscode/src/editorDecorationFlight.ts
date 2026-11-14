/**
 * Editor-only flight using public VS Code text decorations.
 * decoration API. NO Gtk, compositor/DBus, native window, or global coordinates.
 *
 * Limitations: the public API does not provide the editor's pixel viewport or
 * the drop point relative to it. Explorer-to-editor horizontal placement is a
 * bounded estimate, never an exact cursor-to-editor mapping. It cannot cover
 * tabs, the sidebars, or other panels.
 */
import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { CHARACTER_DEFINITIONS } from './generated/characters';
import { createEditorFlight, editorFlightLane, editorFlightSettled, editorFlightSpriteSize,
    editorFlightAdaptiveWidth, editorFlightVisibleLineCount,
    rebaseEditorFlight, returnEditorFlight, stepEditorFlight,
    type EditorFlightBody, type EditorFlightSource } from './editorDecorationFlightMath';
import type { HandoffStatusMessage } from './editorFlightProtocol';

interface EditorFlightRequest {
    readonly requestId: string;
    readonly id: string;
    readonly vx: number;
    readonly vy: number;
    readonly editorXHint?: number;
    readonly sourceStage?: EditorFlightSource;
    readonly spriteWidth: number;
    readonly spriteHeight: number;
}
type StatusCallback = (status: HandoffStatusMessage) => void;

export class EditorDecorationFlight implements vscode.Disposable {
    // Each accepted throw owns its decorations and timer. Limit the total to
    // keep animation CPU/memory bounded in large editor workspaces.
    private static readonly MAX_FLIGHTS = 3;
    private readonly flights = new Map<string, () => void>();
    private disposed = false;

    public constructor(private readonly extensionUri: vscode.Uri,
        private readonly log: (message: string) => void) {}

    public tryLaunch(req: EditorFlightRequest, report: StatusCallback): boolean {
        const sourceStage = req.sourceStage ?? 'Explorer';
        if (sourceStage !== 'Explorer' && sourceStage !== 'Bottom Panel') { return false; }
        const key = `${sourceStage}:${req.id}`;
        if (this.disposed || this.flights.has(key) ||
            this.flights.size >= EditorDecorationFlight.MAX_FLIGHTS ||
            !Number.isFinite(req.vx) || !Number.isFinite(req.vy) ||
            Math.abs(req.vx) > 1500 || Math.abs(req.vy) > 1500) {
            return false;
        }
        const character = CHARACTER_DEFINITIONS.find(item => item.id === req.id);
        const editor = (vscode.window.activeTextEditor &&
            vscode.window.visibleTextEditors.includes(vscode.window.activeTextEditor) ?
            vscode.window.activeTextEditor : undefined) ??
            vscode.window.visibleTextEditors.find(item =>
                item.document.uri.scheme === 'file' || item.document.uri.scheme === 'untitled');
        if (!character || !editor || !vscode.window.visibleTextEditors.includes(editor) ||
            !['file', 'untitled'].includes(editor.document.uri.scheme) ||
            editor.visibleRanges.length === 0) { return false; }
        // A flight belongs to the document that received the drop. VS Code may
        // reuse an editor group for another tab while the animation is running.
        // Never draw a stale sprite over the replacement document.
        const launchDocument = editor.document;
        let height: number;
        let width: number;
        try {
            const size = editorFlightSpriteSize(req.spriteWidth, req.spriteHeight,
                character.frameWidth, character.frameHeight);
            if (!size) { return false; }
            // Use precisely the source panel's rendered CSS-pixel dimensions.
            // There is intentionally no independent editor-only size setting.
            height = size.height;
            width = size.width;
        } catch (error) {
            this.log(`[EDITOR FLIGHT] invalid sprite size: ${String(error).slice(0, 100)}`);
            return false;
        }
        const calculateBounds = () => {
            // Font size, explicit line height and zoom can change during a
            // flight. Recalculate from the current editor configuration rather
            // than preserving geometry captured at the initial throw.
            const configuredLineHeight = vscode.workspace.getConfiguration('editor').get<number>('lineHeight', 0);
            const fontSize = vscode.workspace.getConfiguration('editor').get<number>('fontSize', 14);
            const lineHeight = configuredLineHeight && configuredLineHeight > 0 ?
                configuredLineHeight : Math.round(fontSize * 1.5);
            // VS Code does not expose the text editor's pixel width. A release
            // farther right is evidence for extending the lane, but NOT a
            // measured boundary. Honor any explicit width preference as a cap.
            const flightConfig = vscode.workspace.getConfiguration('touhouFumo');
            const preferredWidth = flightConfig.get<number>('editorFlight.laneWidth', 720);
            const inspected = flightConfig.inspect ? flightConfig.inspect<number>('editorFlight.laneWidth') : undefined;
            const explicitlyLimited = inspected !== undefined && (
                inspected.globalValue !== undefined || inspected.workspaceValue !== undefined ||
                inspected.workspaceFolderValue !== undefined);
            const laneWidth = editorFlightAdaptiveWidth(preferredWidth,
                vscode.window.visibleTextEditors.length, req.editorXHint, width, explicitlyLimited);
            // visibleRanges only cover actual text rows, not the blank editor
            // surface after EOF. Sum disjoint rows to accommodate folding.
            const visible = editor.visibleRanges;
            const lines = editorFlightVisibleLineCount(visible);
            const first = visible.reduce((min, range) => Math.min(min, range.start.line), Infinity);
            const last = visible.reduce((max, range) => Math.max(max, range.end.line), -1);
            const atEnd = last >= editor.document.lineCount - 1;
            const shortDocument = atEnd && lines <= 12 &&
                (editor.document.lineCount <= 12 || first > 0);
            return editorFlightLane(lines, lineHeight, width, height, laneWidth, shortDocument);
        };
        let bounds: ReturnType<typeof calculateBounds>;
        let body: EditorFlightBody;
        try {
            bounds = calculateBounds();
            body = createEditorFlight(req.vx, req.vy, bounds, req.editorXHint, sourceStage);
        } catch (error) {
            // Bad layout/configuration must fail back to the known-good panel
            // flight, not propagate through the extension host message loop.
            this.log(`[EDITOR FLIGHT] invalid initial viewport: ${String(error).slice(0, 100)}`);
            return false;
        }
        const initialX = Math.round(body.x);
        const spin = Array.from(new Set(character.animations.spin.frames.length ?
            character.animations.spin.frames : [0]));
        const frames: vscode.TextEditorDecorationType[] = [];
        try {
            // Extracted project assets already exist; do not generate or alter sprites.
            // Avoid sharing decoration types between concurrent Fumos: clearing
            // one sprite's previous frame must not erase another sprite.
            for (const index of spin) {
                const name = `frame-${String(index).padStart(2, '0')}.png`;
                const png = vscode.Uri.joinPath(this.extensionUri, 'media',
                    character.assetDirectory, character.framesDirectory, name);
                const base64 = readFileSync(png.fsPath).toString('base64');
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
                    `<image width="${width}" height="${height}" image-rendering="pixelated" ` +
                    `href="data:image/png;base64,${base64}"/></svg>`;
                const uri = vscode.Uri.parse('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
                frames.push(vscode.window.createTextEditorDecorationType({
                    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
                    after: { contentIconPath: uri, margin: '0',
                        textDecoration: 'none; position: absolute; pointer-events: none; z-index: 5;' }
                }));
            }
        } catch (error) {
            for (const decoration of frames) { decoration.dispose(); }
            this.log(`[EDITOR FLIGHT] refused to load sprite frames: ${String(error).slice(0, 100)}`);
            return false;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        let frameShown = -1;
        let active = true;
        const stop = (): void => {
            if (!active) { return; }
            active = false;
            if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
            for (const decoration of frames) {
                // Editor closure can invalidate a decoration target. Always
                // dispose the type and release the admission slot regardless.
                try { editor.setDecorations(decoration, []); } catch { /* closed */ }
                try { decoration.dispose(); } catch { /* continue cleanup */ }
            }
            this.flights.delete(key);
        };
        this.flights.set(key, stop);
        const started = Date.now();
        let previous = started;
        let displayed = false;
        let lastBounce: { x: number; y: number; time: number } | undefined;
        let returnFrom: EditorFlightBody | undefined;
        let returnStartedAt: number | undefined;
        let settledSince: number | undefined;
        const RETURN_DURATION_MS = 560;
        const clear = (status: 'returned' | 'failed'): void => {
            if (!active) { return; }
            stop();
            if (!this.disposed) {
                try { report({ type: 'handoffOverlayStatus', requestId: req.requestId, id: req.id, status }); }
                catch { /* panel/webview may have been disposed */ }
            }
            this.log(`[EDITOR FLIGHT] ${req.id} ${status} request=${req.requestId}`);
        };
        const render = (): void => {
            if (!active) { return; }
            try {
                if (!vscode.window.visibleTextEditors.includes(editor) ||
                    editor.visibleRanges.length === 0 || editor.document !== launchDocument ||
                    launchDocument.isClosed) {
                    clear('failed'); return;
                }
                const now = Date.now();
                const elapsed = now - started;
                // Hard cap protects against slow animation ticks and lost restores.
                if (elapsed >= 4000 || (returnStartedAt !== undefined &&
                    now - returnStartedAt >= RETURN_DURATION_MS)) {
                    clear('returned'); return;
                }
                const updated = calculateBounds();
                if (updated.width !== bounds.width || updated.height !== bounds.height) {
                    bounds = updated;
                    body = rebaseEditorFlight(body, bounds);
                    if (returnFrom) { returnFrom = rebaseEditorFlight(returnFrom, bounds); }
                    this.log(`[EDITOR FLIGHT] ${req.id} lane-resized ${bounds.width}x${bounds.height}`);
                }
                // If even the observed text viewport cannot contain a full sprite,
                // restore the panel pet rather than drawing over tabs.
                if (bounds.height < 16) { clear('failed'); return; }
                const currentRange = editor.visibleRanges[0];
                const topLine = Math.max(0, Math.min(editor.document.lineCount - 1, currentRange.start.line));
                // Anchor to the FIRST glyph, not the end of a potentially long line.
                // After-decoration otherwise appears far to the right/off-screen.
                const line = editor.document.lineAt(topLine).text;
                const anchor = new vscode.Range(topLine, 0, topLine, Math.min(1, line.length));
                if (returnStartedAt === undefined) {
                    body = stepEditorFlight(body, bounds, Math.max(0, Math.min(0.065, (now - previous) / 1000)));
                    if (editorFlightSettled(body, bounds) && elapsed >= 650) {
                        settledSince ??= now;
                    } else {
                        settledSince = undefined;
                    }
                    // No long pause on the ground: pull home once settled,
                    // or after the bounded flight period when still bouncing.
                    if (elapsed >= 3000 || (settledSince !== undefined && now - settledSince >= 150)) {
                        returnStartedAt = now;
                        returnFrom = body;
                    }
                } else {
                    body = returnEditorFlight(returnFrom!, bounds,
                        (now - returnStartedAt) / RETURN_DURATION_MS, sourceStage);
                }
                previous = now;
                const index = Math.floor((now - started) / 90) % frames.length;
                if (frameShown !== -1 && frameShown !== index) {
                    editor.setDecorations(frames[frameShown], []);
                }
                editor.setDecorations(frames[index], [{range: anchor, renderOptions: {after: {
                    // The anchor remains in the visible text editor; the decoration
                    // is pointer-transparent. Dynamic CSS position is experimental.
                    textDecoration: `none; position: absolute; transform: translate(${Math.round(body.x)}px, ${Math.round(body.y)}px); pointer-events: none; z-index: 5;`
                }}}]);
                frameShown = index;
                if (!displayed) {
                    displayed = true;
                    try { report({ type: 'handoffOverlayStatus', requestId: req.requestId, id: req.id, status: 'active' }); }
                    catch { clear('failed'); return; }
                    this.log(`[EDITOR FLIGHT] ${req.id} active request=${req.requestId} source=${sourceStage} ` +
                        `lane=${bounds.width}x${bounds.height} startX=${initialX} ` +
                        `(editor text only, horizontal estimate=${req.editorXHint === undefined ? 'unavailable' : 'yes'})`);
                }
                // De-duplicate identical contact logs, but never suppress actual
                // physics steps. Rapid distinct collisions still remain visible.
                if (returnStartedAt === undefined && body.bounced && (!lastBounce ||
                    now - lastBounce.time > 140 ||
                    Math.hypot(body.x - lastBounce.x, body.y - lastBounce.y) > 12)) {
                    this.log(`[EDITOR FLIGHT] ${req.id} bounce (${Math.round(body.x)},${Math.round(body.y)})`);
                    lastBounce = { x: body.x, y: body.y, time: now };
                }
                timer = setTimeout(render, 45);
            } catch (error) {
                // A tab/document can disappear between our visibility check
                // and its lineAt()/setDecorations() calls. Always restore its
                // source Fumo and release this flight's admission slot.
                this.log(`[EDITOR FLIGHT] viewport/render error: ${String(error).slice(0, 120)}`);
                clear('failed');
            }
        };
        render();
        return active;
    }

    public dispose(): void {
        this.disposed = true;
        for (const stop of Array.from(this.flights.values())) { stop(); }
    }
}
