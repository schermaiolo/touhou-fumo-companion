/**
 * Editor-text-only flight. Units are approximate CSS pixels; this
 * module never infers global Wayland coordinates or controls another window.
 */
export type EditorFlightSource = 'Explorer' | 'Bottom Panel';

export interface EditorFlightBody {
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly bounced: boolean;
}
export interface EditorFlightBounds {
    readonly width: number;
    readonly height: number;
}

const clamp = (v: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, v));

/** A modest flick boost; a deliberate stationary drop stays stationary. */
const launchVelocity = (v: number): number => clamp(v * 1.18, -860, 860);

/**
 * Editor decorations are sized using the CSS pixels of the Fumo in its source
 * panel. Reject implausible/mismatched geometry instead of silently resizing it.
 * A rejected editor flight uses the existing panel-local fallback.
 */
export function editorFlightSpriteSize(
    panelWidth: number, panelHeight: number, frameWidth: number, frameHeight: number
): { width: number; height: number } | undefined {
    if (![panelWidth, panelHeight, frameWidth, frameHeight].every(Number.isFinite) ||
        panelWidth < 12 || panelHeight < 12 || panelWidth > 256 || panelHeight > 256 ||
        frameWidth <= 0 || frameHeight <= 0) { return; }
    const width = Math.round(panelWidth);
    const height = Math.round(panelHeight);
    const expected = Math.round(height * frameWidth / frameHeight);
    if (Math.abs(width - expected) > Math.max(3, Math.ceil(expected * 0.03))) { return; }
    return { width, height };
}

/** A settled Fumo can be pulled home immediately instead of waiting on the floor. */
export function editorFlightSettled(body: EditorFlightBody, bounds: EditorFlightBounds): boolean {
    return [body.x, body.y, body.vx, body.vy, bounds.height].every(Number.isFinite) &&
        body.y >= bounds.height - 1 && Math.abs(body.vx) < 16 && Math.abs(body.vy) < 2;
}

/**
 * Optional xHint is a panel-relative estimate, never an authoritative drop
 * coordinate. Fall back to a predictable edge entry when it is absent.
 */
export function createEditorFlight(
    vx: number, vy: number, bounds: EditorFlightBounds, xHint?: number,
    source: EditorFlightSource = 'Explorer'
): EditorFlightBody {
    if (!Number.isFinite(vx) || !Number.isFinite(vy) ||
        !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) ||
        bounds.width <= 0 || bounds.height <= 0) {
        throw new Error('Invalid editor preview flight');
    }
    const x = xHint !== undefined && Number.isFinite(xHint) && Math.abs(xHint) <= 5000
        ? clamp(Math.round(xHint), 4, Math.max(4, bounds.width - 4))
        : source === 'Bottom Panel' ? Math.round(bounds.width / 2) : 4;
    return {
        x, y: source === 'Bottom Panel' ? Math.max(0, bounds.height - 4) : Math.round(bounds.height * 0.28),
        vx: launchVelocity(vx), vy: launchVelocity(vy), bounced: false
    };
}

export function stepEditorFlight(
    body: EditorFlightBody, bounds: EditorFlightBounds, elapsedSeconds: number
): EditorFlightBody {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > 0.1 ||
        ![body.x, body.y, body.vx, body.vy, bounds.width, bounds.height].every(Number.isFinite) ||
        bounds.width <= 0 || bounds.height <= 0) {
        throw new Error('Invalid editor preview step');
    }
    let x = body.x + body.vx * elapsedSeconds;
    let vx = body.vx;
    let y: number;
    let vy: number;
    let bounced = false;
    // A resting sprite should not be repeatedly accelerated into the floor.
    const resting = body.y >= bounds.height - 0.001 && body.vy === 0;
    if (resting) {
        y = bounds.height;
        vy = 0;
        vx *= Math.pow(0.65, elapsedSeconds * 20);
    } else {
        vy = body.vy + 745 * elapsedSeconds;
        y = body.y + (body.vy + vy) * 0.5 * elapsedSeconds;
        if (y < 0 && vy < 0) {
            y = Math.min(bounds.height, -y); // reflect penetration inside the lane
            vy = -vy * 0.70;
            bounced = true;
        }
        if (y >= bounds.height && vy > 0) {
            const impact = vy;
            if (impact > 110) {
                y = Math.max(0, bounds.height - Math.min(bounds.height, y - bounds.height));
                // Retain a little more momentum across successive floor contacts.
                vy = -impact * 0.66;
                vx *= 0.90;
                bounced = true;
            } else {
                y = bounds.height;
                vy = 0;
            }
        }
    }
    // Reflect only outward motion. A frame beginning on the boundary with
    // velocity already pointing inward must NOT cause another bounce.
    if ((x < 0 && vx < 0) || (x > bounds.width && vx > 0)) {
        x = x < 0 ? -x : 2 * bounds.width - x;
        vx = -vx * 0.80;
        bounced = true;
    }
    x = clamp(x, 0, bounds.width);
    y = clamp(y, 0, bounds.height);
    if (Math.abs(vx) < 8) { vx = 0; }
    return { x, y, vx, vy, bounced };
}

/**
 * An accelerating, opaque pull diagonally toward the editor's upper-left edge.
 * After reaching the edge, the original Fumo reappears in its source panel.
 * Decorations cannot draw across the editor/sidebar boundary.
 */
export function returnEditorFlight(
    from: EditorFlightBody, bounds: EditorFlightBounds, progress: number,
    _source: EditorFlightSource = 'Explorer'
): EditorFlightBody {
    if (![progress, from.x, from.y, bounds.width, bounds.height].every(Number.isFinite) ||
        bounds.width <= 0 || bounds.height <= 0) {
        throw new Error('Invalid editor return');
    }
    // Ease-in: little movement at first, then a sharp pull into the corner.
    const t = clamp(progress, 0, 1);
    const ease = t * t * t;
    return {
        x: clamp(from.x * (1 - ease), 0, bounds.width),
        y: clamp(from.y * (1 - ease), 0, bounds.height),
        vx: 0, vy: 0, bounced: false
    };
}

/**
 * A TEXT-EDITOR lane, not a measured editor DOM rectangle. Visible text rows
 * provide a useful approximate vertical extent for long documents. No fixed
 * 580px ceiling: taller editors should not bounce against an artificial floor.
 * For short documents, visibleRanges stops at EOF; blank space below cannot
 * be measured, so we intentionally retain the conservative 155px fallback.
 */
export function editorFlightLane(visibleLines: number, lineHeight: number,
    spriteWidth: number, spriteHeight: number, preferredWidth = 720,
    shortDocument = false): EditorFlightBounds {
    if (![visibleLines, lineHeight, spriteWidth, spriteHeight, preferredWidth].every(Number.isFinite) ||
        !Number.isInteger(visibleLines) || visibleLines < 1 ||
        lineHeight <= 0 || spriteWidth <= 0 || spriteHeight <= 0) {
        throw new Error('Invalid editor lane dimensions');
    }
    const measured = Math.round(visibleLines * lineHeight - spriteHeight - lineHeight);
    return {
        width: Math.max(12, clamp(preferredWidth, 300, 1600) - spriteWidth),
        height: shortDocument ? 155 : clamp(measured, 12, 1200)
    };
}

/**
 * A conservative width budget when more than one text editor is visible.
 * VS Code does not publish the actual editor viewport width, so this is NOT
 * an exact measurement and cannot detect Chat/sidebar width changes.
 * The user-configured laneWidth remains an upper bound.
 */
export function editorFlightWidthBudget(preferredWidth: number, visibleEditors: number): number {
    if (!Number.isFinite(preferredWidth) || !Number.isInteger(visibleEditors) || visibleEditors < 1) {
        throw new Error('Invalid editor width budget');
    }
    return Math.min(preferredWidth, visibleEditors > 1 ? Math.max(300, Math.floor(preferredWidth / visibleEditors)) : preferredWidth);
}

/**
 * Include every visible text range, including disjoint ranges caused by
 * folding. Avoid counting overlapping intervals twice. These ranges provide
 * vertical coverage only; they do NOT reveal the editor's pixel width.
 */
export function editorFlightVisibleLineCount(
    ranges: readonly { readonly start: { readonly line: number }; readonly end: { readonly line: number } }[]
): number {
    if (!ranges.length) { throw new Error('No visible text ranges'); }
    const sorted = ranges.map(range => {
        const start = range.start.line;
        const end = range.end.line;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
            start < 0 || end < start || end > 10000000) {
            throw new Error('Invalid visible text range');
        }
        return { start, end };
    }).sort((a, b) => a.start - b.start);
    let total = 0;
    let lastEnd = -1;
    for (const range of sorted) {
        const first = Math.max(range.start, lastEnd + 1);
        if (first <= range.end) { total += range.end - first + 1; }
        lastEnd = Math.max(lastEnd, range.end);
    }
    return total;
}

/**
 * With only public VS Code APIs, the editor's horizontal pixel width is
 * UNKNOWN. On a single editor, a trustworthy-looking Explorer release farther
 * right is useful evidence for extending the approximate flight lane. This
 * never guesses the actual window boundary. Keep an explicitly set laneWidth
 * as a hard limit, and use conservative budgeting with split editors.
 */
export function editorFlightAdaptiveWidth(
    preferredWidth: number, visibleEditors: number, xHint: number | undefined,
    spriteWidth: number, explicitlyLimited: boolean
): number {
    const base = editorFlightWidthBudget(preferredWidth, visibleEditors);
    if (!Number.isFinite(spriteWidth) || spriteWidth <= 0) {
        throw new Error('Invalid sprite width for flight budget');
    }
    if (explicitlyLimited || visibleEditors !== 1 ||
        xHint === undefined || !Number.isFinite(xHint) || xHint <= 0 || xHint > 1400) {
        return base;
    }
    // An xHint is a panel-relative ESTIMATE, not a measured editor width.
    // Grow only enough to cover the observed release; never above 1,500 px.
    return Math.min(1500, Math.max(base, Math.ceil(xHint + spriteWidth + 36)));
}

/** Keep a moving Fumo inside newly reduced bounds when the Output panel grows. */
export function rebaseEditorFlight(
    from: EditorFlightBody, bounds: EditorFlightBounds
): EditorFlightBody {
    if (![from.x, from.y, from.vx, from.vy, bounds.width, bounds.height].every(Number.isFinite) ||
        bounds.width <= 0 || bounds.height <= 0) {
        throw new Error('Invalid editor viewport rebase');
    }
    const x = clamp(from.x, 0, bounds.width);
    const y = clamp(from.y, 0, bounds.height);
    // A resize is NOT an impact. Preserve inward motion if the old position
    // was outside the new lane; reflect only outward velocity, without logging
    // a false wall bounce on the next tick.
    const vx = from.x !== x && ((x === 0 && from.vx < 0) ||
        (x === bounds.width && from.vx > 0)) ? -from.vx * 0.5 : from.vx;
    const vy = from.y !== y && ((y === 0 && from.vy < 0) ||
        (y === bounds.height && from.vy > 0)) ? -from.vy * 0.3 : from.vy;
    return { x, y, vx, vy, bounced: false };
}
