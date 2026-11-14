/**
 * Regression coverage for the settings webview's manifest mapping, type checks,
 * and workspace-over-user precedence. No VS Code extension host is required.
 */
import * as assert from 'node:assert/strict';
import { getSettingsDescriptors, isValidSettingValue, preferredSettingsScope } from '../settingsSchema';

suite('dedicated settings schema', () => {
	const fields = getSettingsDescriptors({
		contributes: { configuration: [{ properties: {
			'touhouFumo.editorFlight.enabled': {
				type: 'boolean', default: true, description: 'Editor flight'
			},
			'touhouFumo.characterSettings.size': {
				type: 'number', minimum: 32, maximum: 180
			},
			'touhouFumo.reactionRules.trigger': {
				type: 'string', enum: ['typing', 'newline']
			},
			'anotherExtension.enabled': { type: 'boolean' }
		} }] }
	});

	test('exposes only Touhou Fumo settings in the appropriate sections', () => {
		assert.equal(fields.length, 3);
		assert.equal(fields.find((field) => field.key === 'editorFlight.enabled')?.section, 'movement');
		assert.equal(fields.find((field) => field.key === 'characterSettings.size')?.section, 'characters');
		assert.equal(fields.find((field) => field.key === 'reactionRules.trigger')?.section, 'reactions');
	});

	test('rejects invalid booleans, numbers and enum values', () => {
		const flight = fields.find((field) => field.key === 'editorFlight.enabled')!;
		const size = fields.find((field) => field.key === 'characterSettings.size')!;
		const trigger = fields.find((field) => field.key === 'reactionRules.trigger')!;
		assert.ok(isValidSettingValue(flight, false));
		assert.ok(!isValidSettingValue(flight, 'false'));
		assert.ok(isValidSettingValue(size, 95));
		assert.ok(!isValidSettingValue(size, 500));
		assert.ok(!isValidSettingValue(size, NaN));
		assert.ok(isValidSettingValue(trigger, 'typing'));
		assert.ok(!isValidSettingValue(trigger, 'not-a-trigger'));
	});


	test('maps manifest integer properties to validated number inputs', () => {
		const descriptors = getSettingsDescriptors({ contributes: { configuration: [{ properties: {
			'touhouFumo.editorFlight.laneWidth': {
				type: 'integer', minimum: 300, maximum: 1200
			}
		} }] } });
		const lane = descriptors[0];
		assert.equal(lane.type, 'number');
		assert.ok(isValidSettingValue(lane, 720));
		assert.ok(!isValidSettingValue(lane, 720.5));
		assert.ok(!isValidSettingValue(lane, 150));
	});

	test('uses the workspace scope only when an override already exists', () => {
		assert.equal(preferredSettingsScope(undefined), 'user');
		assert.equal(preferredSettingsScope({ workspaceValue: undefined }), 'user');
		assert.equal(preferredSettingsScope({ workspaceValue: false }), 'workspace');
		assert.equal(preferredSettingsScope({ workspaceValue: 0 }), 'workspace');
	});

	test('gives priority presets readable names without changing stored IDs', () => {
		const descriptors = getSettingsDescriptors({ contributes: { configuration: [{ properties: {
			'touhouFumo.defaults.priorityPreset': {
				type: 'string', enum: ['standard', 'special-first', 'quiet']
			}
		} }] } });
		const preset = descriptors[0];
		assert.deepEqual(preset.options?.map(item => item.value), ['standard', 'special-first', 'quiet']);
		assert.ok(preset.options?.[0].label.startsWith('Balanced'));
		assert.ok(preset.options?.[1].label.startsWith('Unique animations first'));
		assert.ok(preset.options?.[2].label.startsWith('Subtle animations first'));
	});

	test('rejects unbounded strings', () => {
		assert.ok(!isValidSettingValue({
			key: 'x', label: 'X', description: '', type: 'string',
			section: 'advanced', order: 1
		}, 'x'.repeat(1025)));
	});
});
