/**
 * @file explorerPets.ts
 * @brief Adapt generated character data into serializable stage definitions.
 *
 * Platform : VS Code / Code-OSS extension host
 * Author   : Daniel Fridman (schermaiolo)
 *
 * This module is the boundary between generated character metadata, effective
 * user settings and the shared browser-side stage runtime used by Explorer,
 * Bottom Panel and Coding Session surfaces.
 */
import * as vscode from 'vscode';

import {
	CHARACTER_DEFINITIONS
} from './generated/characters';

import type {
	GeneratedAnimationDefinition,
	GeneratedCharacterDefinition
} from './generated/characters';

import type {
	CharacterFrequency,
	CharacterRandomFrequency,
	CharacterSettingsController
} from './characterSettings';

import type {
	ExplorerPetDefinition
} from './explorerPetsHtml';

/** Build the enabled runtime pet list for one webview instance. */
export function getExplorerPetDefinitions(
	extensionUri: vscode.Uri,
	webview: vscode.Webview,
	characterSettings:
		CharacterSettingsController
): ExplorerPetDefinition[] {
	return CHARACTER_DEFINITIONS
		.filter((character) =>
			characterSettings
				.getEffective(character)
				.enabled
		)
		.map((character) =>
			toExplorerPetDefinition(
				character,
				characterSettings,
				extensionUri,
				webview
			)
		);
}

/** Resolve one character into browser-safe dimensions, timings and asset URIs. */
function toExplorerPetDefinition(
	character: GeneratedCharacterDefinition,
	characterSettings:
		CharacterSettingsController,
	extensionUri: vscode.Uri,
	webview: vscode.Webview
): ExplorerPetDefinition {
	const effective =
		characterSettings.getEffective(character);

	const idleFrame =
		character.animations.idle.frames[0] ?? 0;

	const blinkFrame =
		character.animations.blink.frames[0] ??
		idleFrame;

	const special = expandSpecialAnimation(
		character.animations.special,
		idleFrame
	);

	const spin = expandAnimation(
		character.animations.spin
	);

	const motionRange = frequencyRange(
		'motion',
		effective.idleMovementFrequency
	);

	const specialRange = randomFrequencyRange(
		'special',
		effective.randomSpecial
	);

	const spinRange = randomFrequencyRange(
		'spin',
		effective.randomSpin
	);

	const crazySpinRange = randomFrequencyRange(
		'crazy',
		effective.crazySpin
	);

	const movementAmplitude =
		effective.idleMovement === 'subtle'
			? Math.max(2, Math.round(effective.size * 0.04))
			: effective.idleMovement === 'bouncy'
				? Math.max(6, Math.round(effective.size * 0.12))
				: 0;

	return {
		id: character.id,
		name: character.name,

		spriteSheetUri:
			getSpriteSheetUri(
				webview,
				extensionUri,
				character.assetDirectory,
				character.spriteSheet
			),

		frameWidth: character.frameWidth,
		frameHeight: character.frameHeight,
		frameCount: character.frameCount,
		displayHeight: effective.size,

		idleFrame,
		blinkFrame,

		specialFrames: special.frames,
		specialDurations: special.durations,
		spinFrames: spin.frames,
		spinDurations: spin.durations,

		idleMovement: effective.idleMovement,
		movementAmplitude,
		motionDurationMs:
			character.behavior.motion.durationMs,
		motionMinIntervalMs: motionRange.minimum,
		motionMaxIntervalMs: motionRange.maximum,

		randomSpecialEnabled:
			effective.randomSpecial !== 'off',
		specialMinIntervalMs: specialRange.minimum,
		specialMaxIntervalMs: specialRange.maximum,

		randomSpinEnabled:
			spin.frames.length > 0 &&
			effective.randomSpin !== 'off',
		spinMinIntervalMs: spinRange.minimum,
		spinMaxIntervalMs: spinRange.maximum,

		randomCrazySpinEnabled:
			spin.frames.length > 0 &&
			effective.crazySpin !== 'off',
		crazySpinMinIntervalMs: crazySpinRange.minimum,
		crazySpinMaxIntervalMs: crazySpinRange.maximum,

		priorityPreset: effective.priorityPreset,
		manualText: effective.manualMessage
	};
}

/** Expand loops/hold timing into a flat frame-duration sequence for JS. */
function expandSpecialAnimation(
	animation: GeneratedAnimationDefinition,
	idleFrame: number
): {
	frames: number[];
	durations: number[];
} {
	const frames: number[] = [];
	const durations: number[] = [];
	const totalFrames =
		animation.frames.length * animation.loops;
	let emitted = 0;

	for (
		let loop = 0;
		loop < animation.loops;
		loop += 1
	) {
		for (const frame of animation.frames) {
			emitted += 1;
			frames.push(frame);
			durations.push(
				animation.frameDurationMs +
					(emitted === totalFrames
						? animation.holdLastFrameMs
						: 0)
			);

			if (emitted < totalFrames) {
				frames.push(idleFrame);
				durations.push(140);
			}
		}
	}

	return { frames, durations };
}

/** Flatten animation loops and final hold time into per-frame durations. */
function expandAnimation(
	animation: GeneratedAnimationDefinition
): {
	frames: number[];
	durations: number[];
} {
	const frames: number[] = [];
	const durations: number[] = [];

	for (
		let loop = 0;
		loop < animation.loops;
		loop += 1
	) {
		for (const frame of animation.frames) {
			frames.push(frame);
			durations.push(animation.frameDurationMs);
		}
	}

	const lastDurationIndex = durations.length - 1;

	if (
		lastDurationIndex >= 0 &&
		animation.holdLastFrameMs > 0
	) {
		durations[lastDurationIndex] +=
			animation.holdLastFrameMs;
	}

	return { frames, durations };
}

/** Translate UI frequency presets into concrete randomized timer ranges. */
function randomFrequencyRange(
	kind: 'special' | 'spin' | 'crazy',
	frequency: CharacterRandomFrequency
): {
	minimum: number;
	maximum: number;
} {
	if (frequency === 'off') {
		return {
			minimum: Number.MAX_SAFE_INTEGER,
			maximum: Number.MAX_SAFE_INTEGER
		};
	}

	return frequencyRange(kind, frequency);
}

/** Convert semantic frequency presets into randomized millisecond intervals. */
function frequencyRange(
	kind: 'motion' | 'special' | 'spin' | 'crazy',
	frequency: CharacterFrequency
): {
	minimum: number;
	maximum: number;
} {
	const ranges = {
		motion: {
			frequent: [2000, 5000],
			normal: [10000, 25000],
			rare: [45000, 90000]
		},
		special: {
			frequent: [8000, 15000],
			normal: [30000, 60000],
			rare: [90000, 180000]
		},
		spin: {
			frequent: [8000, 15000],
			normal: [30000, 60000],
			rare: [120000, 240000]
		},
		crazy: {
			frequent: [20000, 40000],
			normal: [90000, 180000],
			rare: [300000, 600000]
		}
	} as const;

	const [minimum, maximum] =
		ranges[kind][frequency];

	return { minimum, maximum };
}

/** Convert an extension-local sprite sheet path into a CSP-safe webview URI. */
function getSpriteSheetUri(
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	characterDirectory: string,
	filename: string
): string {
	return webview
		.asWebviewUri(
			vscode.Uri.joinPath(
				extensionUri,
				'media',
				characterDirectory,
				filename
			)
		)
		.toString();
}
