import { strict as assert } from 'node:assert';
import { deriveLocalHandoff, parseHandoffGeometry } from '../handoffGeometry';

const base = {
    stageViewportLeft: 16, stageViewportTop: 24,
    grabX: 30, grabY: 40,
    spriteWidth: 101, spriteHeight: 95, devicePixelRatio: 1.5
};

describe('Local Fumo handoff geometry (no Wayland execution)', () => {
    it('keeps the grabbed point fixed across a panel release', () => {
        const parsed = parseHandoffGeometry(base);
        assert.ok(parsed);
        assert.deepEqual(deriveLocalHandoff(330, 140, parsed), {
            pointerStageX: 314, pointerStageY: 116,
            spriteOriginStageX: 284, spriteOriginStageY: 76
        });
    });

    it('handles releases beyond the left/top boundary without clamping', () => {
        const parsed = parseHandoffGeometry(base);
        assert.ok(parsed);
        const result = deriveLocalHandoff(-20, -10, parsed);
        assert.equal(result.spriteOriginStageX, -66);
        assert.equal(result.spriteOriginStageY, -74);
    });

    it('preserves logical CSS pixels across fractional display scale', () => {
        const parsed = parseHandoffGeometry({ ...base, devicePixelRatio: 2.5 });
        assert.ok(parsed);
        assert.equal(deriveLocalHandoff(330, 140, parsed).spriteOriginStageX, 284);
    });

    it('rejects invalid, non-finite and oversized geometry', () => {
        assert.equal(parseHandoffGeometry(null), undefined);
        assert.equal(parseHandoffGeometry({ ...base, grabX: Number.NaN }), undefined);
        assert.equal(parseHandoffGeometry({ ...base, grabY: -12 }), undefined);
        assert.equal(parseHandoffGeometry({ ...base, devicePixelRatio: 0 }), undefined);
        assert.equal(parseHandoffGeometry({ ...base, spriteWidth: 999999 }), undefined);
    });
});
