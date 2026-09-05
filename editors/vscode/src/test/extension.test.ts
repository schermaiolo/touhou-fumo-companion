/**
 * @file extension.test.ts
 * @brief Static tests for generated character metadata used by the extension.
 *
 * Platform : VS Code extension test runner
 * Author   : Daniel Fridman (schermaiolo)
 *
 * These tests catch manifest/generator regressions before packaging: duplicate
 * IDs, out-of-range animation frames and accidental changes to shipped manual
 * messages. Runtime interaction is covered by the manual pre-release checklist.
 */
import * as assert from 'assert';

import {
	CHARACTER_DEFINITIONS
} from '../generated/characters';

suite('Generated character definitions', () => {
	test('character IDs are unique', () => {
		const ids = CHARACTER_DEFINITIONS.map(
			(character) => character.id
		);

		assert.strictEqual(
			new Set(ids).size,
			ids.length
		);
	});

	test('all animation frames fit their sprite sheets', () => {
		for (const character of CHARACTER_DEFINITIONS) {
			for (const animation of Object.values(character.animations)) {
				if (animation === undefined) {
					continue;
				}

				for (const frame of animation.frames) {
					assert.ok(
						frame >= 0 &&
						frame < character.frameCount,
						`${character.id}: frame ${frame} is out of range`
					);
				}
			}
		}
	});

	test('standard manual messages are generated correctly', () => {
		const messages = new Map(
			CHARACTER_DEFINITIONS.map(
				(character) => [character.id, character.manualText]
			)
		);

		assert.strictEqual(messages.get('youmu'), 'Myon!');
		assert.strictEqual(messages.get('reimu'), 'Donate plz');
		assert.strictEqual(messages.get('koishi'), 'Do you see me?');
	});
});
