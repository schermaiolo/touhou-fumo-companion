/**
 * @file explorerPetsHtml.ts
 * @brief Build the shared multi-fumo webview runtime used by VS Code stages.
 *
 * Platform : VS Code / Code-OSS webview
 * Author   : Daniel Fridman (schermaiolo)
 *
 * The returned HTML owns browser-side layout, motion, animation arbitration,
 * bubbles, click handling and rule execution. It deliberately receives plain
 * serializable definitions so all VS Code stage surfaces share one behavior.
 */
import * as vscode from 'vscode';

export type IdleMovement =
	| 'off'
	| 'subtle'
	| 'bouncy';

export interface ExplorerPetDefinition {
	readonly id: string;
	readonly name: string;
	readonly spriteSheetUri: string;
	readonly frameWidth: number;
	readonly frameHeight: number;
	readonly frameCount: number;
	readonly displayHeight: number;
	readonly idleFrame: number;
	readonly blinkFrame: number;
	readonly specialFrames: readonly number[];
	readonly specialDurations: readonly number[];
	readonly spinFrames: readonly number[];
	readonly spinDurations: readonly number[];
	readonly idleMovement: IdleMovement;
	readonly movementAmplitude: number;
	readonly motionDurationMs: number;
	readonly motionMinIntervalMs: number;
	readonly motionMaxIntervalMs: number;
	readonly randomSpecialEnabled: boolean;
	readonly specialMinIntervalMs: number;
	readonly specialMaxIntervalMs: number;
	readonly randomSpinEnabled: boolean;
	readonly spinMinIntervalMs: number;
	readonly spinMaxIntervalMs: number;
	readonly randomCrazySpinEnabled: boolean;
	readonly crazySpinMinIntervalMs: number;
	readonly crazySpinMaxIntervalMs: number;
	readonly priorityPreset: string;
	readonly manualText: string;
}

export function getExplorerPetsHtml(
	webview: vscode.Webview,
	pets: readonly ExplorerPetDefinition[]
): string {
	const nonce = getNonce();
	const encodedPets = JSON.stringify(pets)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026');

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta
		http-equiv="Content-Security-Policy"
		content="default-src 'none'; img-src ${webview.cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
	>
	<title>Touhou Fumo</title>
	<style nonce="${nonce}">
		* { box-sizing: border-box; }
		html, body { width: 100%; height: 100%; min-height: 145px; margin: 0; overflow: hidden; }
		body { color: var(--vscode-editor-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); }
		.world { position: relative; width: 100%; height: 100%; min-height: 145px; overflow: hidden; }
		.floor { position: absolute; right: 5px; bottom: 3px; left: 5px; height: 1px; background: var(--vscode-sideBar-border); opacity: 0.45; }
		.empty-message { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 14px; color: var(--vscode-descriptionForeground); text-align: center; }
		.pet { --pet-height: 100px; position: absolute; top: 0; left: 0; z-index: 2; will-change: transform; cursor: pointer; user-select: none; outline: none; }
		.pet:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
		.sprite { background-repeat: no-repeat; image-rendering: pixelated; image-rendering: crisp-edges; pointer-events: none; }
		.bubble { position: absolute; left: 50%; bottom: calc(var(--pet-height) + 3px); z-index: 4; max-width: 155px; min-width: 54px; padding: 5px 8px; border: 1px solid var(--vscode-editorWidget-border); border-radius: 8px; color: var(--vscode-editorWidget-foreground); background: var(--vscode-editorWidget-background); font-size: 11px; font-weight: 600; line-height: 1.25; text-align: center; white-space: normal; opacity: 0; transform: translateX(-50%) translateY(4px); transition: opacity 90ms ease, transform 90ms ease; pointer-events: none; }
		.bubble::after { content: ""; position: absolute; left: 50%; bottom: -5px; width: 8px; height: 8px; border-right: 1px solid var(--vscode-editorWidget-border); border-bottom: 1px solid var(--vscode-editorWidget-border); background: var(--vscode-editorWidget-background); transform: translateX(-50%) rotate(45deg); }
		.bubble.success, .bubble.success::after { border-color: var(--vscode-testing-iconPassed); }
		.bubble.error, .bubble.error::after { border-color: var(--vscode-testing-iconFailed); }
		.bubble.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
	</style>
</head>
<body>
	<main id="world" class="world"><div class="floor"></div></main>
	<script nonce="${nonce}">
	(() => {
		const DEFINITIONS = ${encodedPets};
		const world = document.getElementById('world');
		if (!(world instanceof HTMLElement)) return;

		if (!Array.isArray(DEFINITIONS) || DEFINITIONS.length === 0) {
			const message = document.createElement('div');
			message.className = 'empty-message';
			message.textContent = 'No Fumo characters are enabled.';
			world.appendChild(message);
			return;
		}

		// Persist enabled IDs per webview session so only newly enabled pets replay the entrance.
		let previousEnabledIds = [];
		try {
			const stored = sessionStorage.getItem('touhouFumo.enabledCharacterIds');
			const parsed = stored === null ? [] : JSON.parse(stored);
			if (Array.isArray(parsed)) previousEnabledIds = parsed;
		} catch {
			previousEnabledIds = [];
		}

		const currentEnabledIds = DEFINITIONS.map((definition) => definition.id);
		const enteringIds = new Set(
			currentEnabledIds.filter((id) => !previousEnabledIds.includes(id))
		);

		try {
			sessionStorage.setItem(
				'touhouFumo.enabledCharacterIds',
				JSON.stringify(currentEnabledIds)
			);
		} catch {
			// Entrance animation still works for this load.
		}

		const pets = DEFINITIONS.map(createPet);
		layoutPets();

		// Priority presets are numeric here so preemption/queue comparisons stay cheap.
		function priorityMap(preset) {
			if (preset === 'special-first') {
				return { manual: 600, editor: 500, special: 400, crazySpin: 300, spin: 200, blink: 100 };
			}
			if (preset === 'quiet') {
				return { manual: 600, editor: 500, blink: 400, special: 300, spin: 200, crazySpin: 100 };
			}
			return { manual: 600, editor: 500, crazySpin: 400, spin: 300, special: 200, blink: 100 };
		}

		function createPet(definition, index) {
			const displayHeight = Math.max(1, Number(definition.displayHeight));
			const displayWidth = Math.max(1, Math.round(definition.frameWidth * displayHeight / definition.frameHeight));
			const element = document.createElement('div');
			element.className = 'pet';
			element.tabIndex = 0;
			element.setAttribute('role', 'button');
			element.setAttribute('aria-label', definition.name);
			element.title = 'Click ' + definition.name;
			element.style.width = displayWidth + 'px';
			element.style.height = displayHeight + 'px';
			element.style.setProperty('--pet-height', displayHeight + 'px');

			const bubble = document.createElement('div');
			bubble.className = 'bubble';
			bubble.setAttribute('role', 'status');
			const sprite = document.createElement('div');
			sprite.className = 'sprite';
			sprite.style.width = displayWidth + 'px';
			sprite.style.height = displayHeight + 'px';
			sprite.style.backgroundImage = 'url("' + definition.spriteSheetUri + '")';
			sprite.style.backgroundSize = (displayWidth * definition.frameCount) + 'px ' + displayHeight + 'px';
			element.appendChild(bubble);
			element.appendChild(sprite);
			world.appendChild(element);

			const now = performance.now();
			const pet = {
				definition, element, sprite, bubble, index,
				width: displayWidth, height: displayHeight,
				baseX: 0, baseY: 0, currentFrame: -1,
				currentAction: null, pendingAction: null,
				priorities: priorityMap(definition.priorityPreset),
				motionActive: false, motionStartedAt: 0,
				motionDurationMs: definition.motionDurationMs,
				motionAmplitude: definition.movementAmplitude,
				motionStyle: definition.idleMovement,
				bubbleHideAt: 0,
				nextBlinkAt: now + randomBetween(4500, 11000),
				nextMotionAt: scheduleTime(now, definition.motionMinIntervalMs, definition.motionMaxIntervalMs),
				nextSpecialAt: scheduleTime(now, definition.specialMinIntervalMs, definition.specialMaxIntervalMs),
				nextSpinAt: scheduleTime(now, definition.spinMinIntervalMs, definition.spinMaxIntervalMs),
				nextCrazySpinAt: scheduleTime(now, definition.crazySpinMinIntervalMs, definition.crazySpinMaxIntervalMs)
			};

			element.addEventListener('click', () => {
				requestAction(pet, makeSpecialAction(pet, 'manual', definition.manualText, 'normal'), performance.now(), true);
			});
			element.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					requestAction(pet, makeSpecialAction(pet, 'manual', definition.manualText, 'normal'), performance.now(), true);
				}
			});
			setFrame(pet, definition.idleFrame);

			if (
				enteringIds.has(definition.id) &&
				Array.isArray(definition.spinFrames) &&
				definition.spinFrames.length > 0
			) {
				requestAction(
					pet,
					makeCrazySpinAction(pet, 'manual', '', 'normal'),
					now,
					false
				);
			}

			return pet;
		}

		function randomBetween(minimum, maximum) { return minimum + Math.random() * (maximum - minimum); }
		function scheduleTime(now, minimum, maximum) { return now + randomBetween(minimum, maximum); }
		function actionPriority(pet, kind) { return Number(pet.priorities[kind]) || 0; }
		function floorY(pet) { return Math.max(0, world.clientHeight - pet.height - 5); }

		// Stage layout is recalculated from current webview dimensions on every resize.
		function layoutPets() {
			const gap = 8;
			const availableWidth = Math.max(0, world.clientWidth - 10);
			const totalWidth = pets.reduce((sum, pet) => sum + pet.width, 0) + gap * Math.max(0, pets.length - 1);
			if (totalWidth <= availableWidth) {
				let x = 5 + (availableWidth - totalWidth) / 2;
				for (const pet of pets) {
					pet.baseX = x;
					pet.baseY = floorY(pet);
					x += pet.width + gap;
					renderPosition(pet, performance.now());
				}
				return;
			}
			for (let index = 0; index < pets.length; index += 1) {
				const pet = pets[index];
				const ratio = (index + 1) / (pets.length + 1);
				pet.baseX = Math.max(0, Math.min(world.clientWidth - pet.width, world.clientWidth * ratio - pet.width / 2));
				pet.baseY = floorY(pet);
				renderPosition(pet, performance.now());
			}
		}

		function setFrame(pet, requestedFrame) {
			const frameIndex = Number.isInteger(requestedFrame) && requestedFrame >= 0 && requestedFrame < pet.definition.frameCount ? requestedFrame : pet.definition.idleFrame;
			if (frameIndex === pet.currentFrame) return;
			pet.currentFrame = frameIndex;
			pet.sprite.style.backgroundPosition = '-' + (frameIndex * pet.width) + 'px 0px';
		}

		function motionOffset(pet, now) {
			if (!pet.motionActive) return 0;
			const progress = Math.min(1, Math.max(0, (now - pet.motionStartedAt) / pet.motionDurationMs));
			if (progress >= 1) {
				pet.motionActive = false;
				pet.nextMotionAt = scheduleTime(now, pet.definition.motionMinIntervalMs, pet.definition.motionMaxIntervalMs);
				return 0;
			}
			return -Math.sin(Math.PI * progress) * pet.motionAmplitude;
		}

		function crazyY(pet, now) {
			const action = pet.currentAction;
			if (action === null || action.visualKind !== 'crazySpin') return null;
			const duration = Math.max(1, action.totalDurationMs);
			const progress = Math.min(1, Math.max(0, (now - action.startedAt) / duration));
			const eased = progress * progress * progress;
			const start = -pet.height - 8;
			const end = world.clientHeight + pet.height + 8;
			return start + (end - start) * eased;
		}

		function renderPosition(pet, now) {
			pet.baseY = floorY(pet);
			const fallingY = crazyY(pet, now);
			const y = fallingY === null ? pet.baseY + motionOffset(pet, now) : fallingY;
			pet.element.style.transform = 'translate3d(' + Math.round(pet.baseX) + 'px, ' + Math.round(y) + 'px, 0)';
		}

		function startMotion(pet, now, forced, styleOverride) {
			const style = styleOverride || pet.definition.idleMovement;
			if (style === 'off') return false;
			if (pet.currentAction !== null && !forced) return false;
			pet.motionStyle = style;
			pet.motionAmplitude = style === 'subtle'
				? Math.max(2, Math.round(pet.height * 0.04))
				: Math.max(6, Math.round(pet.height * 0.12));
			pet.motionDurationMs = forced ? Math.min(300, pet.definition.motionDurationMs) : pet.definition.motionDurationMs;
			pet.motionStartedAt = now;
			pet.motionActive = true;
			return true;
		}

		function scheduleNextBlink(pet, now) { pet.nextBlinkAt = now + randomBetween(5200, 13000); }
		function rescheduleIdleActions(pet, now) {
			scheduleNextBlink(pet, now);
			pet.nextMotionAt = scheduleTime(now, pet.definition.motionMinIntervalMs, pet.definition.motionMaxIntervalMs);
			pet.nextSpecialAt = scheduleTime(now, pet.definition.specialMinIntervalMs, pet.definition.specialMaxIntervalMs);
			pet.nextSpinAt = scheduleTime(now, pet.definition.spinMinIntervalMs, pet.definition.spinMaxIntervalMs);
			pet.nextCrazySpinAt = scheduleTime(now, pet.definition.crazySpinMinIntervalMs, pet.definition.crazySpinMaxIntervalMs);
		}

		function showBubble(pet, text, tone, hideAt) {
			if (typeof text !== 'string' || text.trim().length === 0) return;
			pet.bubble.textContent = text;
			pet.bubble.classList.remove('normal', 'success', 'error');
			pet.bubble.classList.add(tone === 'success' || tone === 'error' ? tone : 'normal');
			pet.bubble.classList.add('visible');
			pet.bubbleHideAt = Number(hideAt) || 0;
		}
		function hideBubble(pet) {
			pet.bubble.classList.remove('visible');
			pet.bubbleHideAt = 0;
		}

		// Sprite actions share one lane; software motion is tracked separately.
		function makeAction(priorityKind, visualKind, frames, durations, text, tone) {
			return { priorityKind, visualKind, frames: Array.from(frames || []), durations: Array.from(durations || []), text, tone: tone || 'normal' };
		}
		function makeSpecialAction(pet, priorityKind, text, tone) { return makeAction(priorityKind, 'special', pet.definition.specialFrames, pet.definition.specialDurations, text, tone); }
		function makeBlinkAction(pet, priorityKind, text, tone) { return makeAction(priorityKind, 'blink', [pet.definition.idleFrame, pet.definition.blinkFrame, pet.definition.idleFrame], [70, 180, 90], text, tone); }
		function makeSpinAction(pet, priorityKind, text, tone) { return makeAction(priorityKind, 'spin', pet.definition.spinFrames, pet.definition.spinDurations, text, tone); }
		function makeCrazySpinAction(pet, priorityKind, text, tone) {
			if (!Array.isArray(pet.definition.spinFrames) || pet.definition.spinFrames.length === 0) return makeAction(priorityKind, 'crazySpin', [], [], text, tone);
			const frames = [];
			while (frames.length < 32) {
				for (const frame of pet.definition.spinFrames) frames.push(frame);
			}
			return makeAction(priorityKind, 'crazySpin', frames, frames.map(() => 40), text, tone);
		}
		function makeMessageAction(pet, priorityKind, text, tone) {
			if (typeof text !== 'string' || text.trim().length === 0) return makeAction(priorityKind, 'none', [], [], text, tone);
			return makeAction(priorityKind, 'message', [pet.definition.idleFrame], [700], text, tone);
		}

		function startAction(pet, request, now) {
			if (!Array.isArray(request.frames) || request.frames.length === 0) return false;
			hideBubble(pet);
			const totalDurationMs = request.durations.reduce((sum, value) => sum + (Number(value) || 100), 0);
			pet.currentAction = {
				...request,
				priority: actionPriority(pet, request.priorityKind),
				frameIndex: 0,
				startedAt: now,
				totalDurationMs,
				nextFrameAt: now + (Number(request.durations[0]) || 100)
			};
			pet.motionActive = false;
			setFrame(pet, request.frames[0]);
			showBubble(pet, request.text, request.tone, 0);
			return true;
		}

		// Higher priority preempts. Important blocked events may keep one best pending action.
		function requestAction(pet, request, now, queueWhenBlocked) {
			if (!Array.isArray(request.frames) || request.frames.length === 0) return 'unavailable';
			request.priority = actionPriority(pet, request.priorityKind);
			const current = pet.currentAction;
			if (current === null) { startAction(pet, request, now); return 'started'; }
			if (request.priority > current.priority) {
				hideBubble(pet);
				pet.currentAction = null;
				startAction(pet, request, now);
				return 'preempted';
			}
			if (queueWhenBlocked) {
				const pending = pet.pendingAction;
				if (pending === null || request.priority >= pending.priority) pet.pendingAction = request;
				return 'queued';
			}
			return 'blocked';
		}

		function finishAction(pet, now) {
			hideBubble(pet);
			pet.currentAction = null;
			setFrame(pet, pet.definition.idleFrame);
			const pending = pet.pendingAction;
			pet.pendingAction = null;
			if (pending !== null) { startAction(pet, pending, now); return; }
			rescheduleIdleActions(pet, now);
		}

		function updateAction(pet, now) {
			const action = pet.currentAction;
			if (action === null) return;
			while (pet.currentAction === action && now >= action.nextFrameAt) {
				action.frameIndex += 1;
				if (action.frameIndex >= action.frames.length) { finishAction(pet, now); return; }
				setFrame(pet, action.frames[action.frameIndex]);
				action.nextFrameAt += Number(action.durations[action.frameIndex]) || 100;
			}
		}

		function rescheduleCandidate(pet, kind, now) {
			if (kind === 'crazySpin') pet.nextCrazySpinAt = scheduleTime(now, pet.definition.crazySpinMinIntervalMs, pet.definition.crazySpinMaxIntervalMs);
			else if (kind === 'spin') pet.nextSpinAt = scheduleTime(now, pet.definition.spinMinIntervalMs, pet.definition.spinMaxIntervalMs);
			else if (kind === 'special') pet.nextSpecialAt = scheduleTime(now, pet.definition.specialMinIntervalMs, pet.definition.specialMaxIntervalMs);
			else if (kind === 'blink') scheduleNextBlink(pet, now);
		}

		// Random candidates never pile up: choose the highest-priority due action and reschedule it.
		function evaluateIdleSpriteActions(pet, now) {
			const candidates = [];
			if (pet.definition.randomCrazySpinEnabled && pet.definition.spinFrames.length > 0 && now >= pet.nextCrazySpinAt) candidates.push(makeCrazySpinAction(pet, 'crazySpin'));
			if (pet.definition.randomSpinEnabled && pet.definition.spinFrames.length > 0 && now >= pet.nextSpinAt) candidates.push(makeSpinAction(pet, 'spin'));
			if (pet.definition.randomSpecialEnabled && now >= pet.nextSpecialAt) candidates.push(makeSpecialAction(pet, 'special'));
			if (now >= pet.nextBlinkAt) candidates.push(makeBlinkAction(pet, 'blink'));
			if (candidates.length === 0) return;
			candidates.sort((left, right) => actionPriority(pet, right.priorityKind) - actionPriority(pet, left.priorityKind));
			const candidate = candidates[0];
			requestAction(pet, candidate, now, false);
			rescheduleCandidate(pet, candidate.priorityKind, now);
		}

		function updatePet(pet, now) {
			if (pet.bubbleHideAt > 0 && now >= pet.bubbleHideAt) hideBubble(pet);
			updateAction(pet, now);
			evaluateIdleSpriteActions(pet, now);
			if (now >= pet.nextMotionAt) {
				if (startMotion(pet, now, false)) pet.nextMotionAt = scheduleTime(now, pet.definition.motionMinIntervalMs, pet.definition.motionMaxIntervalMs);
				else if (pet.currentAction !== null) pet.nextMotionAt = now + 1000;
			}
			if (pet.currentAction === null) setFrame(pet, pet.definition.idleFrame);
			renderPosition(pet, now);
		}

		function update(now) {
			for (const pet of pets) updatePet(pet, now);
			window.requestAnimationFrame(update);
		}

		function targetedPets(target) {
			if (target === 'random') return pets.length === 0 ? [] : [pets[Math.floor(Math.random() * pets.length)]];
			if (target && target !== 'all') return pets.filter((pet) => pet.definition.id === target);
			return pets;
		}

		// Only the shipped newline->special behavior inherits the character message.
		// Other rule actions obey the Settings contract: empty text means no bubble.
		function applyRule(pet, rule, now) {
			const priorityKind = rule.priorityKind === 'manual' ? 'manual' : 'editor';
			const ruleText = typeof rule.text === 'string' ? rule.text : '';
			const text =
				rule.trigger === 'newline' &&
				rule.action === 'special' &&
				ruleText.trim().length === 0
					? pet.definition.manualText
					: ruleText;

			if (rule.action === 'subtle' || rule.action === 'bouncy') {
				startMotion(pet, now, true, rule.action);
				if (text.trim().length > 0) showBubble(pet, text, rule.tone, now + 700);
				return;
			}
			let request;
			if (rule.action === 'blink') request = makeBlinkAction(pet, priorityKind, text, rule.tone);
			else if (rule.action === 'special') request = makeSpecialAction(pet, priorityKind, text, rule.tone);
			else if (rule.action === 'spin') request = makeSpinAction(pet, priorityKind, text, rule.tone);
			else if (rule.action === 'crazy-spin') request = makeCrazySpinAction(pet, priorityKind, text, rule.tone);
			else request = makeMessageAction(pet, priorityKind, text, rule.tone);
			requestAction(pet, request, now, true);
		}

		// The extension host sends only semantic commands/rules; animation stays inside the webview.
		window.addEventListener('message', (event) => {
			const message = event.data;
			const now = performance.now();

			if (message?.type === 'reactSelected') {
				for (const pet of targetedPets(message.target)) {
					requestAction(
						pet,
						makeSpecialAction(
							pet,
							'manual',
							pet.definition.manualText,
							'normal'
						),
						now,
						true
					);
				}
				return;
			}
			if (message?.type === 'spinSelected') {
				for (const pet of targetedPets(message.target)) requestAction(pet, makeSpinAction(pet, 'manual'), now, true);
				return;
			}
			if (message?.type === 'crazySpinSelected') {
				for (const pet of targetedPets(message.target)) requestAction(pet, makeCrazySpinAction(pet, 'manual'), now, true);
				return;
			}
			if (message?.type === 'ruleAction') {
				for (const pet of targetedPets(message.rule?.target)) applyRule(pet, message.rule || {}, now);
				return;
			}

			// Backward compatibility for older commands/panels.
			if (message?.type !== 'reaction') return;
			for (const pet of pets) {
				if (message.reaction === 'typing') startMotion(pet, now, true, 'subtle');
				else if (message.reaction === 'save' || message.reaction === 'debugEnd') requestAction(pet, makeBlinkAction(pet, 'editor', message.text, message.tone), now, true);
				else if (message.reaction === 'manual') requestAction(pet, makeSpecialAction(pet, 'manual', message.text, message.tone), now, true);
				else requestAction(pet, makeSpecialAction(pet, 'editor', message.text, message.tone), now, true);
			}
		});

		window.addEventListener('resize', layoutPets);
		window.requestAnimationFrame(update);
	})();
	</script>
</body>
</html>`;
}

function getNonce(): string {
	const possible =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
		'abcdefghijklmnopqrstuvwxyz' +
		'0123456789';
	let nonce = '';

	for (let index = 0; index < 32; index += 1) {
		nonce += possible.charAt(
			Math.floor(Math.random() * possible.length)
		);
	}

	return nonce;
}
