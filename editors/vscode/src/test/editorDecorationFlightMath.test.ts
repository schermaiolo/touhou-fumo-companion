import { strict as assert } from 'node:assert';
import { createEditorFlight, editorFlightAdaptiveWidth, editorFlightLane, editorFlightSettled,
    editorFlightSpriteSize, editorFlightVisibleLineCount, editorFlightWidthBudget,
    rebaseEditorFlight, returnEditorFlight,
    stepEditorFlight } from '../editorDecorationFlightMath';

suite('Stage 21 editor text flight: viewport geometry/physics/return (no compositor)', () => {
    const bounds = { width: 680, height: 440 };
    test('begins at a bounded approximate horizontal drop location', () => {
        const start = createEditorFlight(900, -1200, bounds, 417.5);
        assert.deepEqual([start.x, start.y, start.vx, start.vy], [418, 123, 860, -860]);
        assert.equal(createEditorFlight(0, 0, bounds).x, 4);
        assert.equal(createEditorFlight(0, 0, bounds, Number.NaN).x, 4);
        assert.equal(createEditorFlight(0, 0, bounds, 999999).x, 4);
        assert.equal(createEditorFlight(0, 0, bounds, 800).x, 676);
    });
    test('boosts deliberate flicks without turning a stationary drop into a throw', () => {
        const slow = createEditorFlight(0, 0, bounds);
        const flick = createEditorFlight(180, -120, bounds);
        const strong = createEditorFlight(2000, -2000, bounds);
        assert.deepEqual([slow.vx, slow.vy], [0, 0]);
        assert.ok(flick.vx > 180 && flick.vx < 240);
        assert.ok(flick.vy < -120 && flick.vy > -160);
        assert.deepEqual([strong.vx, strong.vy], [860, -860]);
    });
    test('retains more energy on clean wall and floor rebounds', () => {
        const wall = stepEditorFlight({ x: 1, y: 90, vx: -400, vy: 0, bounced: false }, bounds, 0.04);
        assert.equal(wall.bounced, true);
        assert.ok(wall.vx > 310 && wall.vx < 330);
        const floor = stepEditorFlight({ x: 120, y: bounds.height - 1, vx: 200, vy: 350,
            bounced: false }, bounds, 0.04);
        assert.equal(floor.bounced, true);
        assert.ok(floor.vy < -240);
        assert.ok(floor.vx > 170);
    });
    test('moves and collides in the enlarged lane', () => {
        let body = createEditorFlight(560, -450, bounds);
        let collisions = 0;
        for (let i = 0; i < 170; ++i) {
            body = stepEditorFlight(body, bounds, 0.04);
            if (body.bounced) { collisions++; }
            assert.ok(body.x >= 0 && body.x <= bounds.width);
            assert.ok(body.y >= 0 && body.y <= bounds.height);
        }
        assert.ok(collisions >= 2);
    });
    test('supports a wider configurable lane without claiming actual viewport width', () => {
        assert.deepEqual(editorFlightLane(40, 21, 60, 56), { width: 660, height: 763 });
        assert.deepEqual(editorFlightLane(1, 20, 60, 56), { width: 660, height: 12 });
        assert.deepEqual(editorFlightLane(1, 20, 60, 56, 720, true), { width: 660, height: 155 });
        assert.deepEqual(editorFlightLane(6, 21, 60, 56), { width: 660, height: 49 });
        assert.deepEqual(editorFlightLane(35, 21, 60, 56, 500), { width: 440, height: 658 });
    });
    test('rebases motion safely when the Output panel reduces the editor height', () => {
        const moving = createEditorFlight(400, 350, bounds, 500);
        const smaller = { width: 220, height: 65 };
        const shrunk = rebaseEditorFlight(moving, smaller);
        assert.ok(shrunk.x >= 0 && shrunk.x <= 220);
        assert.ok(shrunk.y >= 0 && shrunk.y <= 65);
        let updated = shrunk;
        for (let i = 0; i < 35; i++) {
            updated = stepEditorFlight(updated, smaller, 0.03);
            assert.ok(updated.x >= 0 && updated.x <= smaller.width);
            assert.ok(updated.y >= 0 && updated.y <= smaller.height);
        }
    });
    test('accelerates diagonally into the upper-left before restoring the panel sprite', () => {
        const body = createEditorFlight(320, 90, bounds, 450);
        const a = returnEditorFlight(body, bounds, 0);
        const mid = returnEditorFlight(body, bounds, 0.5);
        const home = returnEditorFlight(body, bounds, 1);
        assert.equal(a.x, body.x);
        assert.ok(mid.x > 0 && mid.x < body.x);
        assert.equal(home.x, 0);
        assert.equal(home.y, 0);
        assert.ok(mid.y >= 0 && mid.y < body.y);
        const early = returnEditorFlight(body, bounds, 0.25);
        const later = returnEditorFlight(body, bounds, 0.75);
        assert.ok((body.x - early.x) < (mid.x - later.x), 'accelerates during the pull');
    });
    test('rejects invalid samples and geometry', () => {
        assert.throws(() => createEditorFlight(Number.NaN, 0, bounds));
        assert.throws(() => stepEditorFlight(createEditorFlight(0, 0, bounds), bounds, -0.1));
        assert.throws(() => stepEditorFlight(createEditorFlight(0, 0, bounds), bounds, 0.2));
        assert.throws(() => editorFlightLane(10, 0, 50, 70));
    });
});

suite('Stage 22: adaptive width budgeting and stable contacts', () => {
    const lane = { width: 660, height: 210 };
    test('uses an honest configurable width cap in one editor, conservatively caps split editors', () => {
        assert.equal(editorFlightWidthBudget(720, 1), 720);
        assert.equal(editorFlightWidthBudget(720, 2), 360);
        assert.equal(editorFlightWidthBudget(720, 3), 300);
        assert.equal(editorFlightWidthBudget(340, 2), 300);
        assert.throws(() => editorFlightWidthBudget(720, 0));
        assert.throws(() => editorFlightWidthBudget(Number.NaN, 1));
    });
    test('recalculates a narrower lane and rebases an active flight without inventing a collision', () => {
        let body = createEditorFlight(540, 0, lane, 630);
        const narrow = editorFlightLane(30, 21, 49, 56, editorFlightWidthBudget(300, 1));
        body = rebaseEditorFlight(body, narrow);
        assert.equal(body.bounced, false);
        assert.equal(body.x, narrow.width);
        assert.ok(body.vx < 0, 'outward velocity reflected on resize');
        body = stepEditorFlight(body, narrow, 0.04);
        assert.ok(body.x < narrow.width, 'moves inward, no repeat at right wall');
        assert.equal(body.bounced, false);
    });
    test('keeps inward velocity when editor resizes across a sprite moving left', () => {
        const shifted = rebaseEditorFlight({ x: 700, y: 90, vx: -300, vy: 0, bounced: false }, lane);
        assert.equal(shifted.vx, -300);
        assert.equal(shifted.bounced, false);
        const next = stepEditorFlight(shifted, lane, 0.05);
        assert.equal(next.bounced, false);
        assert.ok(next.x < lane.width);
    });
    test('makes a single wall rebound and not a second impact on the next frame', () => {
        const hit = stepEditorFlight({x: 1, y: 55, vx: -600, vy: 0, bounced: false}, lane, 0.04);
        assert.ok(hit.x > 0);
        assert.equal(hit.bounced, true);
        assert.ok(hit.vx > 0);
        const after = stepEditorFlight(hit, lane, 0.04);
        assert.equal(after.bounced, false);
        assert.ok(after.x > hit.x);
    });
    test('settles soft floor contact instead of reporting bounces on successive frames', () => {
        let b = { x: 120, y: lane.height, vx: 36, vy: 0, bounced: false };
        for (let i = 0; i < 65; i++) {
            b = stepEditorFlight(b, lane, 0.04);
            assert.equal(b.y, lane.height);
            assert.equal(b.vy, 0);
            assert.equal(b.bounced, false);
        }
        assert.equal(b.vx, 0);
    });
    test('damps small floor impacts and avoids ping-pong near the same coordinates', () => {
        let b = { x: 100, y: lane.height - 0.2, vx: 0, vy: 70, bounced: false };
        b = stepEditorFlight(b, lane, 0.04);
        assert.equal(b.vy, 0);
        assert.equal(b.y, lane.height);
        assert.equal(b.bounced, false);
        b = stepEditorFlight(b, lane, 0.04);
        assert.equal(b.bounced, false);
    });
});


suite('Stage 23: source-aware entry and return', () => {
    const bounds = { width: 500, height: 240 };
    test('preserves Explorer entry and return behavior', () => {
        const start = createEditorFlight(100, 0, bounds);
        assert.equal(start.x, 4);
        assert.equal(start.y, 67);
        assert.equal(returnEditorFlight(start, bounds, 1).x, 0);
    });
    test('enters from below for Bottom Panel without fabricating editor coordinates', () => {
        const start = createEditorFlight(0, -90, bounds, undefined, 'Bottom Panel');
        assert.equal(start.x, 250);
        assert.equal(start.y, 236);
    });
    test('also pulls Bottom Panel Fumos upward-left, not back down', () => {
        const from = createEditorFlight(240, 100, bounds, 185, 'Bottom Panel');
        const halfway = returnEditorFlight(from, bounds, 0.5, 'Bottom Panel');
        const end = returnEditorFlight(from, bounds, 1, 'Bottom Panel');
        assert.equal(end.x, 0);
        assert.equal(end.y, 0);
        assert.ok(halfway.y < from.y && halfway.y > 0);
        assert.equal(returnEditorFlight(from, bounds, 1, 'Explorer').x, 0);
    });
});


suite('Stages 26–27: panel-size continuity and accelerating return', () => {
    const bounds = { width: 500, height: 300 };
    test('keeps the source panel CSS-pixel dimensions for Cirno and Youmu', () => {
        assert.deepEqual(editorFlightSpriteSize(69, 114, 69, 114), { width: 69, height: 114 });
        assert.deepEqual(editorFlightSpriteSize(99, 93, 101, 95), { width: 99, height: 93 });
        assert.deepEqual(editorFlightSpriteSize(82.2, 123.9, 69, 104), { width: 82, height: 124 });
    });
    test('rejects invalid, oversized and incorrect aspect ratio instead of rescaling', () => {
        assert.equal(editorFlightSpriteSize(Number.NaN, 95, 101, 95), undefined);
        assert.equal(editorFlightSpriteSize(1000, 95, 101, 95), undefined);
        assert.equal(editorFlightSpriteSize(100, 100, 69, 114), undefined);
        assert.equal(editorFlightSpriteSize(0, 0, 101, 95), undefined);
    });
    test('settling detection distinguishes resting from bouncing sprites', () => {
        assert.equal(editorFlightSettled({ x: 200, y: 300, vx: 0, vy: 0, bounced: false }, bounds), true);
        assert.equal(editorFlightSettled({ x: 200, y: 299.5, vx: 14, vy: 1, bounced: false }, bounds), true);
        assert.equal(editorFlightSettled({ x: 200, y: 300, vx: 40, vy: 0, bounced: false }, bounds), false);
        assert.equal(editorFlightSettled({ x: 200, y: 250, vx: 0, vy: 0, bounced: false }, bounds), false);
    });
    test('pulls toward upper-left with increasing displacement and no fade', () => {
        const from = { x: 420, y: 280, vx: 0, vy: 0, bounced: false };
        const quarter = returnEditorFlight(from, bounds, 0.25, 'Bottom Panel');
        const half = returnEditorFlight(from, bounds, 0.5, 'Bottom Panel');
        const full = returnEditorFlight(from, bounds, 1, 'Bottom Panel');
        assert.ok(quarter.x > half.x && quarter.y > half.y);
        assert.ok(from.x - quarter.x < quarter.x - half.x);
        assert.deepEqual([full.x, full.y], [0, 0]);
    });
});


suite('Stage 28: larger text area without fictitious viewport geometry', () => {
    test('uses visible text height beyond the old artificial 580px ceiling', () => {
        assert.deepEqual(editorFlightLane(53, 21, 69, 114), {width: 651, height: 978});
        assert.deepEqual(editorFlightLane(100, 24, 69, 114), {width: 651, height: 1200});
        assert.deepEqual(editorFlightLane(4, 21, 69, 114, 720, true), {width: 651, height: 155});
    });
    test('counts multiple visible ranges without double counting folded or overlapping lines', () => {
        const r = (start: number, end: number) => ({start: {line: start}, end: {line: end}});
        assert.equal(editorFlightVisibleLineCount([r(0, 14), r(15, 39)]), 40);
        assert.equal(editorFlightVisibleLineCount([r(0, 14), r(9, 19), r(22, 26)]), 25);
        assert.equal(editorFlightVisibleLineCount([r(15, 19), r(0, 10)]), 16);
        assert.throws(() => editorFlightVisibleLineCount([r(5, 4)]));
        assert.throws(() => editorFlightVisibleLineCount([]));
    });
    test('expands width only from a bounded release hint in one unpinned editor', () => {
        assert.equal(editorFlightAdaptiveWidth(720, 1, 980, 69, false), 1085);
        assert.equal(editorFlightAdaptiveWidth(720, 1, 300, 69, false), 720);
        assert.equal(editorFlightAdaptiveWidth(720, 1, 1400, 100, false), 1500);
        assert.equal(editorFlightAdaptiveWidth(720, 1, 1500, 69, false), 720);
        assert.equal(editorFlightAdaptiveWidth(720, 1, NaN, 69, false), 720);
    });
    test('honors a manually limited width and split-editor budgeting', () => {
        assert.equal(editorFlightAdaptiveWidth(340, 1, 950, 69, true), 340);
        assert.equal(editorFlightAdaptiveWidth(720, 2, 950, 69, false), 360);
        assert.equal(editorFlightAdaptiveWidth(720, 3, 950, 69, false), 300);
        assert.throws(() => editorFlightAdaptiveWidth(720, 1, 200, NaN, false));
    });
    test('does not force a 120px lane when a large sprite needs a narrow setting', () => {
        assert.equal(editorFlightLane(40, 21, 250, 114, 300).width, 50);
    });
});
