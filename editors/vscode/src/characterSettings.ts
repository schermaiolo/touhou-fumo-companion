/**
 * @file characterSettings.ts
 * @brief Persistent per-character settings and compact Settings UI proxy.
 *
 * Platform : VS Code / Code-OSS extension host
 * Author   : Daniel Fridman (schermaiolo)
 *
 * VS Code exposes one selected-character editor instead of a large flat block
 * of settings for every fumo. Persistent profiles live in globalState and are
 * synchronized to/from that proxy while guarding against recursive updates.
 */
import * as vscode from 'vscode';

import {
	CHARACTER_DEFINITIONS
} from './generated/characters';

import type {
	GeneratedCharacterDefinition
} from './generated/characters';

export type CharacterIdleMovement =
	| 'off'
	| 'subtle'
	| 'bouncy';

export type CharacterFrequency =
	| 'rare'
	| 'normal'
	| 'frequent';

export type CharacterRandomFrequency =
	| 'off'
	| CharacterFrequency;

export type CharacterPriorityPreset =
	| 'standard'
	| 'special-first'
	| 'quiet';

/** Fully resolved settings used by a runtime surface for one character. */
export interface EffectiveCharacterSettings {
	readonly enabled: boolean;
	readonly size: number;
	readonly idleMovement: CharacterIdleMovement;
	readonly idleMovementFrequency: CharacterFrequency;
	readonly randomSpecial: CharacterRandomFrequency;
	readonly randomSpin: CharacterRandomFrequency;
	readonly crazySpin: CharacterRandomFrequency;
	readonly priorityPreset: CharacterPriorityPreset;
	readonly manualMessage: string;
}

interface CharacterProfile extends EffectiveCharacterSettings {
	readonly useGeneralDefaults: boolean;
}

type CharacterProfiles =
	Readonly<Record<string, CharacterProfile>>;

const PROFILE_STORAGE_KEY =
	'touhouFumo.characterProfiles.v2';

const OLD_PROFILE_STORAGE_KEY =
	'touhouFumo.characterProfiles.v1';

/*
 * When a shipped default message changes, update existing profiles only if
 * they still contain the exact previous default. Custom user text is kept.
 */
const LEGACY_MANUAL_MESSAGES:
	Readonly<Record<string, string>> = {
		koishi: 'You saw me?',
		reimu: 'Reimu Hakurei'
	};

const CHARACTER_EDITOR_PREFIX =
	'characterSettings';

const DEFAULTS_PREFIX = 'defaults';

const EDITOR_FIELDS = [
	'enabled',
	'useGeneralDefaults',
	'size',
	'idleMovement',
	'idleMovementFrequency',
	'randomSpecial',
	'randomSpin',
	'crazySpin',
	'priorityPreset',
	'manualMessage'
] as const;

/** Owns persistent profiles and synchronization with the native Settings UI. */
export class CharacterSettingsController
	implements vscode.Disposable {

	private synchronizing = false;
	private disposed = false;

	public constructor(
		private readonly context:
			vscode.ExtensionContext
	) {
		context.globalState.setKeysForSync([
			PROFILE_STORAGE_KEY
		]);
	}

	public async initialize(): Promise<void> {
		await this.ensureProfiles();
		await this.ensureSelectedCharacter();
		await this.loadSelectedCharacterIntoEditor();
	}

	public async handleConfigurationChange(
		event: vscode.ConfigurationChangeEvent
	): Promise<boolean> {
		if (this.disposed || this.synchronizing) {
			return false;
		}

		if (
			event.affectsConfiguration(
				`touhouFumo.${CHARACTER_EDITOR_PREFIX}.selected`
			)
		) {
			await this.ensureSelectedCharacter();
			await this.loadSelectedCharacterIntoEditor();
			return true;
		}

		const editorChanged = EDITOR_FIELDS.some(
			(field) =>
				event.affectsConfiguration(
					`touhouFumo.${CHARACTER_EDITOR_PREFIX}.${field}`
				)
		);

		if (editorChanged) {
			await this.saveEditorIntoSelectedCharacter();
			return true;
		}

		if (
			event.affectsConfiguration(
				`touhouFumo.${DEFAULTS_PREFIX}`
			)
		) {
			return true;
		}

		return false;
	}

	public getEffective(
		character: GeneratedCharacterDefinition
	): EffectiveCharacterSettings {
		const profile = this.getProfile(character);

		if (!profile.useGeneralDefaults) {
			return profile;
		}

		const configuration =
			vscode.workspace.getConfiguration(
				'touhouFumo'
			);

		return {
			enabled: profile.enabled,
			size: getNumber(
				configuration,
				`${DEFAULTS_PREFIX}.size`,
				100,
				32,
				180
			),
			idleMovement: getIdleMovement(
				configuration,
				`${DEFAULTS_PREFIX}.idleMovement`,
				'bouncy'
			),
			idleMovementFrequency: getFrequency(
				configuration,
				`${DEFAULTS_PREFIX}.idleMovementFrequency`,
				'normal'
			),
			randomSpecial: getRandomFrequency(
				configuration,
				`${DEFAULTS_PREFIX}.randomSpecial`,
				'normal'
			),
			randomSpin: getRandomFrequency(
				configuration,
				`${DEFAULTS_PREFIX}.randomSpin`,
				'off'
			),
			crazySpin: getRandomFrequency(
				configuration,
				`${DEFAULTS_PREFIX}.crazySpin`,
				'off'
			),
			priorityPreset: getPriorityPreset(
				configuration,
				`${DEFAULTS_PREFIX}.priorityPreset`,
				'standard'
			),
			manualMessage: profile.manualMessage
		};
	}

	public getSelectedCharacterId(): string {
		const configuration =
			vscode.workspace.getConfiguration(
				'touhouFumo'
			);

		const fallback =
			CHARACTER_DEFINITIONS[0]?.id ?? '';

		return configuration.get<string>(
			`${CHARACTER_EDITOR_PREFIX}.selected`,
			fallback
		);
	}

	public dispose(): void {
		this.disposed = true;
	}

	/**
	 * Load the current profile schema or migrate older stored/configuration data.
	 * Migration is kept here so runtime consumers only ever see v2 profiles.
	 */
	private async ensureProfiles(): Promise<void> {
		const current =
			this.context.globalState.get<
				Record<string, CharacterProfile>
			>(PROFILE_STORAGE_KEY);

		if (current !== undefined) {
			const normalized:
				Record<string, CharacterProfile> = {};

			for (const character of CHARACTER_DEFINITIONS) {
				const profile = normalizeProfile(
					current[character.id],
					defaultProfile(character)
				);
				const legacyManualMessage =
					LEGACY_MANUAL_MESSAGES[character.id];

				normalized[character.id] =
					legacyManualMessage !== undefined &&
					profile.manualMessage === legacyManualMessage
						? {
							...profile,
							manualMessage: character.manualText
						}
						: profile;
			}

			await this.context.globalState.update(
				PROFILE_STORAGE_KEY,
				normalized
			);
			return;
		}

		const oldProfiles =
			this.context.globalState.get<
				Record<string, unknown>
			>(OLD_PROFILE_STORAGE_KEY, {});

		const next:
			Record<string, CharacterProfile> = {};

		for (const character of CHARACTER_DEFINITIONS) {
			const old = oldProfiles[character.id];
			next[character.id] = old === undefined
				? this.migrateLegacyConfiguration(character)
				: migrateOldProfile(
					old,
					defaultProfile(character)
				);
		}

		await this.context.globalState.update(
			PROFILE_STORAGE_KEY,
			next
		);
	}

	private migrateLegacyConfiguration(
		character: GeneratedCharacterDefinition
	): CharacterProfile {
		const fallback = defaultProfile(character);
		const configuration =
			vscode.workspace.getConfiguration(
				'touhouFumo'
			);
		const prefix = `characters.${character.id}`;

		const oldMotion = explicitOrFallback(
			configuration,
			`${prefix}.motionMode`,
			undefined as string | undefined
		);
		const oldSpecial = explicitOrFallback(
			configuration,
			`${prefix}.randomSpecial`,
			undefined as boolean | undefined
		);
		const oldSpecialFrequency = explicitOrFallback(
			configuration,
			`${prefix}.specialFrequency`,
			undefined as string | undefined
		);
		const oldSpin = explicitOrFallback(
			configuration,
			`${prefix}.randomSpin`,
			undefined as boolean | undefined
		);
		const oldSpinFrequency = explicitOrFallback(
			configuration,
			`${prefix}.spinFrequency`,
			undefined as string | undefined
		);

		return {
			enabled: explicitOrFallback(
				configuration,
				`${prefix}.enabled`,
				fallback.enabled
			),
			useGeneralDefaults: false,
			size: clamp(
				explicitOrFallback(
					configuration,
					`${prefix}.size`,
					fallback.size
				),
				32,
				180
			),
			idleMovement:
				oldMotion === undefined
					? fallback.idleMovement
					: oldMotionToIdleMovement(oldMotion),
			idleMovementFrequency: normalizeFrequency(
				explicitOrFallback(
					configuration,
					`${prefix}.motionFrequency`,
					fallback.idleMovementFrequency
				),
				fallback.idleMovementFrequency
			),
			randomSpecial: oldBooleanFrequency(
				oldSpecial,
				oldSpecialFrequency,
				fallback.randomSpecial
			),
			randomSpin: oldBooleanFrequency(
				oldSpin,
				oldSpinFrequency,
				fallback.randomSpin
			),
			crazySpin: 'off',
			priorityPreset: 'standard',
			manualMessage: character.manualText
		};
	}

	/** Ensure the selected proxy always points at a character that still exists. */
	private async ensureSelectedCharacter():
		Promise<string> {
		const configuration =
			vscode.workspace.getConfiguration(
				'touhouFumo'
			);

		const fallback =
			CHARACTER_DEFINITIONS[0]?.id ?? '';

		let selected = configuration.get<string>(
			`${CHARACTER_EDITOR_PREFIX}.selected`,
			fallback
		);

		if (
			!CHARACTER_DEFINITIONS.some(
				(character) => character.id === selected
			)
		) {
			selected = fallback;
			await configuration.update(
				`${CHARACTER_EDITOR_PREFIX}.selected`,
				selected,
				vscode.ConfigurationTarget.Global
			);
		}

		return selected;
	}

	/** Copy the selected persistent profile into the native Settings proxy fields. */
	private async loadSelectedCharacterIntoEditor():
		Promise<void> {
		const selected = await this.ensureSelectedCharacter();
		const character = CHARACTER_DEFINITIONS.find(
			(item) => item.id === selected
		);

		if (character === undefined) {
			return;
		}

		const profile = this.getProfile(character);
		const configuration =
			vscode.workspace.getConfiguration(
				'touhouFumo'
			);

		this.synchronizing = true;

		try {
			await updateIfDifferent(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.enabled`,
				profile.enabled
			);
			await updateIfDifferent(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.useGeneralDefaults`,
				profile.useGeneralDefaults
			);
			await updateIfDifferent(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.size`,
				profile.size
			);
			await updateIfDifferent(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.idleMovement`,
				profile.idleMovement
			);
			await updateIfDifferent(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.idleMovementFrequency`,
				profile.idleMovementFrequency
			);
			await updateIfDifferent(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.randomSpecial`,
				profile.randomSpecial
			);
			await updateIfDifferent(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.randomSpin`,
				profile.randomSpin
			);
			await updateIfDifferent(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.crazySpin`,
				profile.crazySpin
			);
			await updateIfDifferent(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.priorityPreset`,
				profile.priorityPreset
			);
			await updateIfDifferent(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.manualMessage`,
				profile.manualMessage
			);
		} finally {
			this.synchronizing = false;
		}
	}

	/** Persist edited proxy values back into only the currently selected profile. */
	private async saveEditorIntoSelectedCharacter():
		Promise<void> {
		const selected = await this.ensureSelectedCharacter();
		const character = CHARACTER_DEFINITIONS.find(
			(item) => item.id === selected
		);

		if (character === undefined) {
			return;
		}

		const fallback = this.getProfile(character);
		const configuration =
			vscode.workspace.getConfiguration(
				'touhouFumo'
			);

		const profile: CharacterProfile = {
			enabled: configuration.get<boolean>(
				`${CHARACTER_EDITOR_PREFIX}.enabled`,
				fallback.enabled
			),
			useGeneralDefaults:
				configuration.get<boolean>(
					`${CHARACTER_EDITOR_PREFIX}.useGeneralDefaults`,
					fallback.useGeneralDefaults
				),
			size: getNumber(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.size`,
				fallback.size,
				32,
				180
			),
			idleMovement: getIdleMovement(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.idleMovement`,
				fallback.idleMovement
			),
			idleMovementFrequency: getFrequency(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.idleMovementFrequency`,
				fallback.idleMovementFrequency
			),
			randomSpecial: getRandomFrequency(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.randomSpecial`,
				fallback.randomSpecial
			),
			randomSpin: getRandomFrequency(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.randomSpin`,
				fallback.randomSpin
			),
			crazySpin: getRandomFrequency(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.crazySpin`,
				fallback.crazySpin
			),
			priorityPreset: getPriorityPreset(
				configuration,
				`${CHARACTER_EDITOR_PREFIX}.priorityPreset`,
				fallback.priorityPreset
			),
			manualMessage: configuration.get<string>(
				`${CHARACTER_EDITOR_PREFIX}.manualMessage`,
				fallback.manualMessage
			)
		};

		await this.context.globalState.update(
			PROFILE_STORAGE_KEY,
			{
				...this.getProfiles(),
				[selected]: profile
			}
		);
	}

	private getProfiles(): CharacterProfiles {
		return this.context.globalState.get<
			Record<string, CharacterProfile>
		>(PROFILE_STORAGE_KEY, {});
	}

	private getProfile(
		character: GeneratedCharacterDefinition
	): CharacterProfile {
		return normalizeProfile(
			this.getProfiles()[character.id],
			defaultProfile(character)
		);
	}
}

function defaultProfile(
	character: GeneratedCharacterDefinition
): CharacterProfile {
	const oldMode = character.behavior.motion.enabled
		? character.behavior.motion.mode
		: 'off';

	return {
		enabled: character.enabledByDefault,
		useGeneralDefaults: false,
		size: character.defaultDisplayHeight,
		idleMovement: oldMotionToIdleMovement(oldMode),
		idleMovementFrequency: frequencyFromInterval(
			character.behavior.motion.minIntervalMs,
			character.behavior.motion.maxIntervalMs
		),
		randomSpecial: character.behavior.randomSpecial.enabled
			? frequencyFromInterval(
				character.behavior.randomSpecial.minIntervalMs,
				character.behavior.randomSpecial.maxIntervalMs
			)
			: 'off',
		randomSpin: character.behavior.randomSpin.enabled
			? frequencyFromInterval(
				character.behavior.randomSpin.minIntervalMs,
				character.behavior.randomSpin.maxIntervalMs
			)
			: 'off',
		crazySpin: 'off',
		priorityPreset: 'standard',
		manualMessage: character.manualText
	};
}

function migrateOldProfile(
	value: unknown,
	fallback: CharacterProfile
): CharacterProfile {
	if (typeof value !== 'object' || value === null) {
		return fallback;
	}

	const old = value as Record<string, unknown>;
	const oldSpecial = typeof old.randomSpecial === 'boolean'
		? old.randomSpecial
		: true;
	const oldSpin = typeof old.randomSpin === 'boolean'
		? old.randomSpin
		: false;

	return {
		enabled: typeof old.enabled === 'boolean'
		? old.enabled
		: fallback.enabled,
		useGeneralDefaults:
			typeof old.useGeneralDefaults === 'boolean'
				? old.useGeneralDefaults
				: false,
		size: typeof old.size === 'number'
		? clamp(old.size, 32, 180)
		: fallback.size,
		idleMovement: oldMotionToIdleMovement(
			typeof old.motionMode === 'string'
				? old.motionMode
				: fallback.idleMovement
		),
		idleMovementFrequency: normalizeFrequency(
			old.motionFrequency,
			fallback.idleMovementFrequency
		),
		randomSpecial: oldSpecial
			? normalizeFrequency(
				old.specialFrequency,
				'normal'
			)
			: 'off',
		randomSpin: oldSpin
			? normalizeFrequency(
				old.spinFrequency,
				'rare'
			)
			: 'off',
		crazySpin: 'off',
		priorityPreset: priorityPresetFromOld(
			old.priorityOrder
		),
		manualMessage: fallback.manualMessage
	};
}

function normalizeProfile(
	value: unknown,
	fallback: CharacterProfile
): CharacterProfile {
	if (typeof value !== 'object' || value === null) {
		return fallback;
	}

	const profile = value as Partial<CharacterProfile>;

	return {
		enabled: typeof profile.enabled === 'boolean'
		? profile.enabled
		: fallback.enabled,
		useGeneralDefaults:
			typeof profile.useGeneralDefaults === 'boolean'
				? profile.useGeneralDefaults
				: fallback.useGeneralDefaults,
		size: typeof profile.size === 'number'
		? clamp(profile.size, 32, 180)
		: fallback.size,
		idleMovement: normalizeIdleMovement(
			profile.idleMovement,
			fallback.idleMovement
		),
		idleMovementFrequency: normalizeFrequency(
			profile.idleMovementFrequency,
			fallback.idleMovementFrequency
		),
		randomSpecial: normalizeRandomFrequency(
			profile.randomSpecial,
			fallback.randomSpecial
		),
		randomSpin: normalizeRandomFrequency(
			profile.randomSpin,
			fallback.randomSpin
		),
		crazySpin: normalizeRandomFrequency(
			profile.crazySpin,
			fallback.crazySpin
		),
		priorityPreset: normalizePriorityPreset(
			profile.priorityPreset,
			fallback.priorityPreset
		),
		manualMessage: typeof profile.manualMessage === 'string'
			? profile.manualMessage
			: fallback.manualMessage
	};
}

function oldBooleanFrequency(
	enabled: boolean | undefined,
	frequency: string | undefined,
	fallback: CharacterRandomFrequency
): CharacterRandomFrequency {
	if (enabled === false) {
		return 'off';
	}

	if (enabled === true) {
		return normalizeFrequency(frequency, 'normal');
	}

	return fallback;
}

function oldMotionToIdleMovement(
	value: unknown
): CharacterIdleMovement {
	if (value === 'off') {
		return 'off';
	}

	if (
		value === 'occasional-bob' ||
		value === 'subtle'
	) {
		return 'subtle';
	}

	return 'bouncy';
}

function priorityPresetFromOld(
	value: unknown
): CharacterPriorityPreset {
	if (typeof value !== 'string') {
		return 'standard';
	}

	if (value.includes('blink>special')) {
		return 'quiet';
	}

	if (value.indexOf('special') < value.indexOf('spin')) {
		return 'special-first';
	}

	return 'standard';
}

function frequencyFromInterval(
	minimum: number,
	maximum: number
): CharacterFrequency {
	const midpoint = (minimum + maximum) / 2;

	if (midpoint <= 30000) {
		return 'frequent';
	}

	if (midpoint <= 120000) {
		return 'normal';
	}

	return 'rare';
}

function getNumber(
	configuration: vscode.WorkspaceConfiguration,
	key: string,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	return clamp(
		configuration.get<number>(key, fallback),
		minimum,
		maximum
	);
}

function getIdleMovement(
	configuration: vscode.WorkspaceConfiguration,
	key: string,
	fallback: CharacterIdleMovement
): CharacterIdleMovement {
	return normalizeIdleMovement(
		configuration.get<unknown>(key),
		fallback
	);
}

function getFrequency(
	configuration: vscode.WorkspaceConfiguration,
	key: string,
	fallback: CharacterFrequency
): CharacterFrequency {
	return normalizeFrequency(
		configuration.get<unknown>(key),
		fallback
	);
}

function getRandomFrequency(
	configuration: vscode.WorkspaceConfiguration,
	key: string,
	fallback: CharacterRandomFrequency
): CharacterRandomFrequency {
	return normalizeRandomFrequency(
		configuration.get<unknown>(key),
		fallback
	);
}

function getPriorityPreset(
	configuration: vscode.WorkspaceConfiguration,
	key: string,
	fallback: CharacterPriorityPreset
): CharacterPriorityPreset {
	return normalizePriorityPreset(
		configuration.get<unknown>(key),
		fallback
	);
}

function normalizeIdleMovement(
	value: unknown,
	fallback: CharacterIdleMovement
): CharacterIdleMovement {
	if (
		value === 'off' ||
		value === 'subtle' ||
		value === 'bouncy'
	) {
		return value;
	}

	return fallback;
}

function normalizeFrequency(
	value: unknown,
	fallback: CharacterFrequency
): CharacterFrequency {
	if (
		value === 'rare' ||
		value === 'normal' ||
		value === 'frequent'
	) {
		return value;
	}

	return fallback;
}

function normalizeRandomFrequency(
	value: unknown,
	fallback: CharacterRandomFrequency
): CharacterRandomFrequency {
	if (value === 'off') {
		return 'off';
	}

	return normalizeFrequency(value, fallback === 'off' ? 'normal' : fallback);
}

function normalizePriorityPreset(
	value: unknown,
	fallback: CharacterPriorityPreset
): CharacterPriorityPreset {
	if (
		value === 'standard' ||
		value === 'special-first' ||
		value === 'quiet'
	) {
		return value;
	}

	return fallback;
}

function clamp(
	value: number,
	minimum: number,
	maximum: number
): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function explicitOrFallback<T>(
	configuration: vscode.WorkspaceConfiguration,
	key: string,
	fallback: T
): T {
	const inspected = configuration.inspect<T>(key);

	return inspected?.workspaceFolderValue ??
		inspected?.workspaceValue ??
		inspected?.globalValue ??
		fallback;
}

async function updateIfDifferent(
	configuration: vscode.WorkspaceConfiguration,
	key: string,
	value: unknown
): Promise<void> {
	if (configuration.get<unknown>(key) === value) {
		return;
	}

	await configuration.update(
		key,
		value,
		vscode.ConfigurationTarget.Global
	);
}
