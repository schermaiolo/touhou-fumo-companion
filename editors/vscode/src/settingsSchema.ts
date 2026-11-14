/**
 * Settings descriptors shared between the host and the local settings webview.
 * The package manifest remains the single source of truth for types/defaults.
 */
export type SettingValue = string | number | boolean;
export type SettingsSection = 'basics' | 'characters' | 'movement' | 'reactions' | 'advanced';

export interface SettingDescriptor {
	readonly key: string;
	readonly label: string;
	readonly description: string;
	readonly type: 'boolean' | 'number' | 'string';
	readonly options?: readonly { value: SettingValue; label: string }[];
	readonly min?: number;
	readonly max?: number;
	readonly integer?: boolean;
	readonly section: SettingsSection;
	readonly order: number;
}

const BASICS = new Set([
	'explorerStage.enabled', 'bottomPanel.enabled',
	'codingSession.enabled', 'codingSession.autoStart',
	'editorPet.enabled', 'editorPet.character', 'editorPet.size'
]);

const MOVEMENT = new Set([
	'physics.enabled', 'editorFlight.enabled', 'editorFlight.laneWidth',
	'defaults.size',
	'defaults.idleMovement', 'defaults.idleMovementFrequency',
	'defaults.randomSpecial', 'defaults.randomSpin',
	'defaults.crazySpin'
]);

const LABELS: Record<string, string> = {
	'explorerStage.enabled': 'Show Fumos in Explorer',
	'bottomPanel.enabled': 'Show the Bottom Panel stage',
	'codingSession.enabled': 'Enable Coding Session',
	'codingSession.autoStart': 'Open Coding Session on startup',
	'editorPet.enabled': 'Show the small Editor Pet',
	'editorPet.character': 'Editor Pet character',
	'editorPet.size': 'Editor Pet size',
	'defaults.size': 'Default Fumo size',
	'physics.enabled': 'Enable grab-and-throw physics',
	'editorFlight.enabled': 'Bounce inside the code editor',
	'editorFlight.laneWidth': 'Editor flight width limit',
	'defaults.idleMovement': 'Idle movement',
	'defaults.idleMovementFrequency': 'Idle movement frequency',
	'defaults.randomSpecial': 'Unique animation frequency',
	'defaults.randomSpin': 'Random spin frequency',
	'defaults.crazySpin': 'Crazy spin frequency',
	'defaults.priorityPreset': 'Animation priority',
	'characterSettings.useGeneralDefaults': 'Use general defaults',
	'characterSettings.manualMessage': 'Manual message',
	'characterSettings.priorityPreset': 'Animation priority',
	'reactionRules.triggerText': 'Trigger text',
	'reactionRules.text': 'Speech bubble',
	'reactionRules.target': 'Fumo target',
	'reactionRules.action': 'Animation',
};

/** Keep persisted preset IDs, but explain what they prioritize in the UI. */
function priorityLabel(value: SettingValue): string {
	switch (value) {
		case 'standard': return 'Balanced — manual and coding reactions first, then crazy spins';
		case 'special-first': return 'Unique animations first — favors each Fumo’s special animation';
		case 'quiet': return 'Subtle animations first — favors blinking (not lower frequency)';
		default: return String(value);
	}
}

/** Decide which existing settings scope should receive an edit. */
export function preferredSettingsScope(
	inspection: { readonly workspaceValue?: unknown } | undefined
): 'workspace' | 'user' {
	// Writing to User would be ignored while the workspace has an override.
	return inspection?.workspaceValue !== undefined ? 'workspace' : 'user';
}

function titleize(key: string): string {
	const last = key.split('.').pop() ?? key;
	return last.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/^./, (value) => value.toUpperCase());
}

function sectionFor(key: string): SettingsSection {
	if (key.startsWith('characterSettings.')) { return 'characters'; }
	if (key.startsWith('reactionRules.')) { return 'reactions'; }
	if (BASICS.has(key)) { return 'basics'; }
	if (MOVEMENT.has(key)) { return 'movement'; }
	return 'advanced';
}

export function getSettingsDescriptors(packageJson: unknown): SettingDescriptor[] {
	if (!packageJson || typeof packageJson !== 'object') { return []; }
	const manifest = packageJson as {
		contributes?: { configuration?: { properties?: Record<string, unknown> }[] }
	};
	const entries = manifest.contributes?.configuration ?? [];
	const result: SettingDescriptor[] = [];
	for (const group of entries) {
		for (const [name, raw] of Object.entries(group.properties ?? {})) {
			if (!name.startsWith('touhouFumo.') || !raw || typeof raw !== 'object') {
				continue;
			}
			const item = raw as Record<string, unknown>;
			if (item.type !== 'boolean' && item.type !== 'number' &&
				item.type !== 'integer' && item.type !== 'string') {
				continue;
			}
			const key = name.slice('touhouFumo.'.length);
			const all = Array.isArray(item.enum) ? item.enum as SettingValue[] : [];
			const labels = Array.isArray(item.enumItemLabels) ? item.enumItemLabels as string[] : [];
			const options = all.length ? all.map((value, index) => ({
				value,
				label: (key === 'defaults.priorityPreset' || key === 'characterSettings.priorityPreset')
					? priorityLabel(value)
					: (typeof labels[index] === 'string' ? labels[index] : String(value))
			})) : undefined;
			result.push({
				key,
				label: LABELS[key] ?? titleize(key),
				description: (key === 'defaults.priorityPreset' || key === 'characterSettings.priorityPreset')
					? 'When multiple animations compete, choose which wins. This does not change how often they happen.'
					: (typeof item.description === 'string' ? item.description : ''),
				type: item.type === 'integer' ? 'number' : item.type,
				section: sectionFor(key),
				order: typeof item.order === 'number' ? item.order : 500,
				options,
				min: typeof item.minimum === 'number' ? item.minimum : undefined,
				max: typeof item.maximum === 'number' ? item.maximum : undefined,
				integer: item.type === 'integer'
			});
		}
	}
	return result.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

/** Reject forged/out-of-range webview writes before updating user configuration. */
export function isValidSettingValue(field: SettingDescriptor, value: unknown): value is SettingValue {
	if (typeof value !== field.type) { return false; }
	if (field.options?.length && !field.options.some((option) => option.value === value)) {
		return false;
	}
	if (typeof value === 'number') {
		return Number.isFinite(value) &&
			(!field.integer || Number.isInteger(value)) &&
			(field.min === undefined || value >= field.min) &&
			(field.max === undefined || value <= field.max);
	}
	if (typeof value === 'string') {
		return value.length <= 1024;
	}
	return true;
}
