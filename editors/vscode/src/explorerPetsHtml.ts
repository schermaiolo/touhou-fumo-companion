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
	readonly physicsEnabled: boolean;
	readonly handoffProbeEnabled: boolean;
	readonly dragPreviewProbeEnabled: boolean;
	readonly dragPreviewVmThrowEnabled: boolean;
	readonly dragPreviewEditorFlightEnabled: boolean;
	readonly dragPreviewLocalFlightEnabled: boolean;
	readonly gesturePrewarmEnabled: boolean;
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
		.pet { --pet-height: 100px; position: absolute; top: 0; left: 0; z-index: 2; will-change: transform; cursor: grab; user-select: none; touch-action: none; outline: none; }
		.pet.dragging { cursor: grabbing; }
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
		// Diagnostic-only transport: never launches a native window or hides the pet.
		const handoffProbeOn = DEFINITIONS.some((definition) => definition.physicsEnabled && definition.handoffProbeEnabled);
		const vscodeHost = handoffProbeOn ? acquireVsCodeApi() : null;
		let nextProbeId = 0;

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
			element.title = definition.physicsEnabled ? 'Drag to throw; arrows to hop; R to return home' : 'Click ' + definition.name;
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
				baseX: 0, baseY: 0, homeX: 0, currentFrame: -1,
				physics: { active: false, dragging: false, pointerId: null, moved: false, suppressClick: false, boundaryReported: false, handoffRequestId: null, grabX: 0, grabY: 0, x: 0, y: 0, vx: 0, vy: 0, spinAt: 0, nextReturnAt: 0, lastAt: now, samples: [], dragStartedAt: 0, dragMoveEvents: 0, dragMaxDispatchDelayMs: 0 },
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

			installPhysics(pet);
			element.addEventListener('click', (event) => {
				if (pet.physics.suppressClick) { event.preventDefault(); pet.physics.suppressClick = false; return; }
				requestAction(pet, makeSpecialAction(pet, 'manual', definition.manualText, 'normal'), performance.now(), true);
			});
			element.addEventListener('keydown', (event) => {
				if (definition.physicsEnabled && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
					event.preventDefault();
					launchPet(pet, event.key === 'ArrowLeft' ? -240 : 240, -340);
					return;
				}
				if (definition.physicsEnabled && (event.key === 'r' || event.key === 'R' || event.key === 'Escape')) {
					event.preventDefault(); returnHome(pet); return;
				}
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
					pet.homeX = x;
					if (!pet.physics.active) pet.baseX = x;
					pet.baseY = floorY(pet);
					x += pet.width + gap;
					renderPosition(pet, performance.now());
				}
				return;
			}
			for (let index = 0; index < pets.length; index += 1) {
				const pet = pets[index];
				const ratio = (index + 1) / (pets.length + 1);
				pet.homeX = Math.max(0, Math.min(world.clientWidth - pet.width, world.clientWidth * ratio - pet.width / 2));
				if (!pet.physics.active) pet.baseX = pet.homeX;
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
			if (pet.physics.active) {
				pet.element.style.transform = 'translate3d(' + Math.round(pet.physics.x) + 'px, ' + Math.round(pet.physics.y) + 'px, 0)';
				return;
			}
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

		// Physics works entirely inside the current webview. A separate desktop overlay
		// is required before a Fumo can move across workbench/editor boundaries.
		function launchPet(pet, vx, vy) {
			const body = pet.physics;
			if (!pet.definition.physicsEnabled) return;
			if (!body.active) { body.x = pet.baseX; body.y = floorY(pet); }
			body.active = true;
			body.dragging = false;
			body.vx = vx;
			body.vy = vy;
			body.lastAt = performance.now();
			body.nextReturnAt = body.lastAt + 6000;
			pet.motionActive = false;
		}

		function returnHome(pet) {
			const body = pet.physics;
			if (!body.active) return;
			const preview = body.dragPreview;
			if (preview && preview.flightActive) {
				preview.flightActive = false;
				preview.reportFlight('flight-home');
			}
			body.dragging = false;
			body.pointerId = null;
			body.active = false;
			pet.baseX = pet.homeX;
			pet.baseY = floorY(pet);
			if (pet.definition.spinFrames.length > 0) {
				requestAction(pet, makeSpinAction(pet, 'manual'), performance.now(), true);
			}
			renderPosition(pet, performance.now());
		}

		function outsideStage(event) {
			return event.clientX < -8 || event.clientX > world.clientWidth + 8 ||
				event.clientY < -8 || event.clientY > world.clientHeight + 8;
		}

		function sendHandoffProbe(pet, event, phase, gestureId) {
			if (!vscodeHost || !pet.definition.handoffProbeEnabled || !pet.definition.physicsEnabled) return;
			const requestId = String(++nextProbeId);
			// Coordinates are deliberately webview-local. screenX/screenY cannot be
			// assumed to identify a global position on Wayland or multiple monitors.
			if (phase === 'release') pet.physics.handoffRequestId = requestId;
			const stageRect = world.getBoundingClientRect();
			vscodeHost.postMessage({
				type: 'handoffProbe', requestId, id: pet.definition.id, phase, gestureId,
				x: event.clientX, y: event.clientY,
				worldWidth: world.clientWidth, worldHeight: world.clientHeight,
				vx: pet.physics.vx, vy: pet.physics.vy, releasedAtMs: Date.now(),
					// Event queue delay and drag count are measured locally and never authorize native launching.
					dragMetrics: {
						moveEvents: pet.physics.dragMoveEvents,
						maxEventDispatchDelayMs: Math.round(pet.physics.dragMaxDispatchDelayMs * 10) / 10,
						durationMs: Math.round(performance.now() - pet.physics.dragStartedAt)
					},
				// Browser viewport/CSS pixel geometry only. Not a global monitor position.
				geometry: {
					stageViewportLeft: stageRect.left, stageViewportTop: stageRect.top,
					grabX: pet.physics.grabX, grabY: pet.physics.grabY,
					spriteWidth: pet.width, spriteHeight: pet.height,
					devicePixelRatio: window.devicePixelRatio || 1
				}
			});
		}

		// Stage 14: a one-gesture browser drag image. Native flight remains strictly
		// VM-gated in the extension host and starts only AFTER a drop.
		// Chromium captures the drag image once: live spin while held is NOT possible
		// through setDragImage(). The native renderer resumes spinning after release.
		function restorePreviewPet(pet) {
			const preview = pet.physics.dragPreview;
			if (!preview) return;
			if (preview.watchdog !== null) {
				clearTimeout(preview.watchdog);
				preview.watchdog = null;
			}
			preview.dragging = false;
			preview.pending = false;
			preview.flightActive = false;
			pet.element.style.opacity = '';
			pet.element.style.visibility = '';
			pet.physics.handoffRequestId = null;
			pet.physics.active = true;
			returnHome(pet);
		}
		// Stage 16 safe F5 fallback. The HTML webview CANNOT draw over the editor
		// after drop: this is deliberately panel-local momentum/collision playback.
		// Native geometry, process and compositor gates remain entirely unchanged.
		function startLocalFlight(pet) {
			const preview = pet.physics.dragPreview;
			if (!preview || preview.flightActive) return;
			if (preview.watchdog !== null) {
				clearTimeout(preview.watchdog);
				preview.watchdog = null;
			}
			preview.pending = false;
			preview.dragging = false;
			pet.element.style.opacity = '';
			pet.element.style.visibility = '';
			pet.physics.handoffRequestId = null;
			const body = pet.physics;
			const last = preview.samples[preview.samples.length - 1];
			const bounds = world.getBoundingClientRect();
			const right = Math.max(0, world.clientWidth - pet.width);
			const floor = floorY(pet);
			const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
			body.x = clamp(last ? last.x - bounds.left - preview.grabX : pet.homeX, 0, right);
			body.y = clamp(last ? last.y - bounds.top - preview.grabY : floor, 0, floor);
			// Native dragend events often have no reliable last-second velocity.
			// The finite, deterministic impulse still permits a visible bounce.
			const vx = Number.isFinite(body.vx) ? clamp(body.vx, -1100, 1100) : 0;
			const vy = Number.isFinite(body.vy) ? clamp(body.vy, -1100, 1100) : 0;
			pet.currentAction = null;
			pet.pendingAction = null;
			launchPet(pet, vx, vy);
			body.nextReturnAt = performance.now() + 4200;
			body.spinAt = 0;
			preview.flightActive = true;
			preview.bounces = 0;
			preview.reportFlight('flight-start');
			// No development-only bubble during normal flight.
			renderPosition(pet, performance.now());
		}
		function installDragPreviewProbe(pet) {
			const element = pet.element;
			element.draggable = true;
			element.title = 'Drag this Fumo into the editor';
			const state = {
				dragging: false, pending: false, cancelled: false, watchdog: null,
				gestureId: null, prepareSent: false,
				flightActive: false, bounces: 0, reportFlight: () => {},
				grabX: Math.floor(pet.width / 2), grabY: Math.floor(pet.height / 2),
				samples: [], dragSamples: [], outsideObserved: false
			};
			pet.physics.dragPreview = state;
			const report = (phase, event) => {
				if (!vscodeHost) return;
				vscodeHost.postMessage({
					type: 'dragPreviewProbe', id: pet.definition.id, phase,
					atMs: Date.now(), x: event.clientX, y: event.clientY,
					grabX: state.grabX, grabY: state.grabY
				});
			};
			state.reportFlight = (phase) => report(phase, { clientX: pet.physics.x, clientY: pet.physics.y });
			const gestureMessage = (phase) => {
				if (!vscodeHost || !pet.definition.gesturePrewarmEnabled || !state.gestureId) return;
				vscodeHost.postMessage({ type: 'handoffGesture', phase,
					gestureId: state.gestureId, id: pet.definition.id, atMs: Date.now(),
					spriteWidth: pet.width, spriteHeight: pet.height });
			};
			const prepareOnce = () => {
				if (state.prepareSent || !state.dragging || state.cancelled) return;
				state.prepareSent = true;
				gestureMessage('prepare');
			};
			const validPoint = (event) => Number.isFinite(event.clientX) && Number.isFinite(event.clientY) &&
				Math.abs(event.clientX) < 20000 && Math.abs(event.clientY) < 20000 &&
				// Chromium may report (0,0) for a drag outside the source webview.
				!(event.clientX === 0 && event.clientY === 0);
			const sample = (event) => {
				if (!validPoint(event)) return;
				const t = performance.now();
				state.samples.push({ x: event.clientX, y: event.clientY, t });
				state.samples = state.samples.filter(point => t - point.t < 550).slice(-6);
				if (outsideStage(event)) { state.outsideObserved = true; prepareOnce(); }
			};
			element.addEventListener('pointerdown', (event) => {
				if (event.button !== 0 || state.pending) return;
				const rect = element.getBoundingClientRect();
				state.grabX = Math.max(0, Math.min(pet.width, event.clientX - rect.left));
				state.grabY = Math.max(0, Math.min(pet.height, event.clientY - rect.top));
				state.samples = [];
				state.dragSamples = [];
				state.cancelled = false;
				state.outsideObserved = false;
				sample(event);
			});
			window.addEventListener('keydown', (event) => {
				if (event.key === 'Escape' && state.dragging) state.cancelled = true;
			});
			// Chromium may zero dragend coordinates when the OS drag leaves the iframe.
			// A top-level dragleave with no related DOM target is affirmative evidence
			// that the ghost left this webview; an unknown (0,0) alone is not.
			window.addEventListener('dragleave', (event) => {
				if (state.dragging && event.relatedTarget == null) { state.outsideObserved = true; prepareOnce(); }
			});
			element.addEventListener('dragstart', (event) => {
				if (!event.dataTransfer || state.pending) { event.preventDefault(); return; }
				event.dataTransfer.clearData();
				event.dataTransfer.setData('application/x-touhou-fumo-preview', pet.definition.id);
				event.dataTransfer.effectAllowed = 'copy';
				try { event.dataTransfer.setDragImage(pet.sprite, Math.round(state.grabX), Math.round(state.grabY)); }
				catch { /* default Chromium drag image is still useful */ }
				state.dragging = true;
				pet.physics.dragStartedAt = performance.now();
				pet.physics.dragMoveEvents = 0;
				pet.physics.dragMaxDispatchDelayMs = 0;
				state.gestureId = String(++nextProbeId);
				state.prepareSent = false;
				state.flightActive = false;
				pet.physics.active = false;
				pet.physics.dragging = false;
				pet.physics.suppressClick = true;
				pet.motionActive = false;
				sample(event);
				report('start', event);
				// SetDragImage must capture a VISIBLE source. Hide the original in the
				// next task, after Chromium has captured the native ghost image.
				setTimeout(() => {
					if (state.dragging || state.pending) element.style.opacity = '0';
				}, 0);
			});
			// Chromium's drag image can report sparse/zero-coordinate samples.
			// Only trust recent movement events; never infer velocity from the
			// full pointerdown-to-drop displacement (which is not a flick).
			function estimateFumoDragVelocity(samples, now) {
				const valid = samples.filter(point => Number.isFinite(point.x) &&
					Number.isFinite(point.y) && Number.isFinite(point.t) &&
					now >= point.t && now - point.t <= 650).slice(-8);
				const b = valid[valid.length - 1];
				if (!b || now - b.t > 360) return { vx: 0, vy: 0 };
				const a = valid.find(point => b.t - point.t >= 32 &&
					b.t - point.t <= 360);
				if (!a) return { vx: 0, vy: 0 };
				const dt = b.t - a.t;
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				// Reject discontinuities: some compositors replace client coordinates
				// during drag rather than reporting actual pointer motion.
				if (Math.abs(dx) > 500 || Math.abs(dy) > 500) return { vx: 0, vy: 0 };
				const clamp = value => Math.max(-720, Math.min(720, value));
				const vx = clamp(dx * 850 / dt);
				const vy = clamp(dy * 850 / dt);
				return Math.abs(vx) + Math.abs(vy) < 65 ? { vx: 0, vy: 0 } : { vx, vy };
			}
			element.addEventListener('drag', (event) => {
				if (!state.dragging) return;
				sample(event);
				if (validPoint(event)) {
					const t = performance.now();
					state.dragSamples.push({ x: event.clientX, y: event.clientY, t });
					state.dragSamples = state.dragSamples.filter(point => t - point.t < 650).slice(-8);
					pet.physics.dragMoveEvents++;
				}
			});
			element.addEventListener('dragend', (event) => {
				if (!state.dragging) return;
				state.dragging = false;
				report('end', event);
				// DragEnd coordinates are not trustworthy across Chromium webviews.
				// KWin must obtain and validate the real cursor position independently.
				const hasEndPoint = validPoint(event);
				if (hasEndPoint) sample(event);
				// A valid inside release overrides an earlier boundary crossing.
				// Historical outside evidence is used only when dragend lacks coordinates.
				const wasOutside = hasEndPoint ? outsideStage(event) : state.outsideObserved;
				const unknownEndPoint = !hasEndPoint;
				const shouldRequest = !state.cancelled && (
					(pet.definition.dragPreviewVmThrowEnabled && (wasOutside || unknownEndPoint)) ||
					(pet.definition.dragPreviewEditorFlightEnabled && wasOutside));
				const shouldLocalFlight = pet.definition.dragPreviewLocalFlightEnabled && !state.cancelled && wasOutside;
				// Compute the last observed velocity for both the guarded native path
				// and the panel-local visual fallback. No desktop coordinates inferred.
				const points = state.samples;
				const last = points[points.length - 1];
				// Pointerdown and dragend are NOT consecutive drag movement samples.
				// In Chromium/Wayland they may be the only events, and treating the
				// entire displacement as an instantaneous flick saturates at 1100.
				const releaseVelocity = estimateFumoDragVelocity(state.dragSamples, performance.now());
				pet.physics.vx = releaseVelocity.vx;
				pet.physics.vy = releaseVelocity.vy;
				pet.physics.grabX = state.grabX;
				pet.physics.grabY = state.grabY;
				if (shouldRequest) {
					state.pending = true;
					// Drag timing now begins at dragstart, not at this release.
					// Only the KWin gate can decide whether a real native launch is safe.
					const safeEnd = hasEndPoint ? event : last || { clientX: 0, clientY: 0 };
					sendHandoffProbe(pet, safeEnd, 'release', state.gestureId);
					const requestId = pet.physics.handoffRequestId;
					if (!requestId) {
						if (shouldLocalFlight) startLocalFlight(pet);
						else restorePreviewPet(pet);
					} else {
						// A lost host/reload cannot strand the Fumo invisibly.
						state.watchdog = setTimeout(() => {
							if (state.pending && pet.physics.handoffRequestId === requestId) {
								if (shouldLocalFlight) startLocalFlight(pet);
								else restorePreviewPet(pet);
							}
						}, 12000);
					}
				} else {
					// An inside drop/Escape must terminate an unused gesture prewarm.
					if (state.prepareSent) gestureMessage('cancel');
					if (shouldLocalFlight) startLocalFlight(pet);
					else restorePreviewPet(pet);
				}
				setTimeout(() => { pet.physics.suppressClick = false; }, 180);
			});
		}
		function installPhysics(pet) {
			if (!pet.definition.physicsEnabled) return;
			if (pet.definition.dragPreviewProbeEnabled && pet.definition.handoffProbeEnabled) {
				installDragPreviewProbe(pet);
				return;
			}
			const element = pet.element;
			element.addEventListener('pointerdown', (event) => {
				if (event.button !== 0) return;
				const body = pet.physics;
				if (!body.active) { body.x = pet.baseX; body.y = floorY(pet); }
				body.active = true; body.dragging = true; body.moved = false; body.boundaryReported = false; body.handoffRequestId = null;
				body.pointerId = event.pointerId; body.vx = 0; body.vy = 0;
				// Measure the actual grabbed point before motion/drag transforms change.
				// This is a CSS pixel offset within the Fumo, not a screen coordinate.
				const spriteRect = element.getBoundingClientRect();
				body.grabX = Math.max(0, Math.min(pet.width, event.clientX - spriteRect.left));
				body.grabY = Math.max(0, Math.min(pet.height, event.clientY - spriteRect.top));
				body.offsetX = event.clientX - body.x;
				body.offsetY = event.clientY - body.y;
				body.samples = [{ x: event.clientX, y: event.clientY, t: performance.now() }];
				body.lastAt = performance.now();
				body.dragStartedAt = body.lastAt;
				body.dragMoveEvents = 0;
				body.dragMaxDispatchDelayMs = 0;
				pet.motionActive = false;
				element.classList.add('dragging');
				element.setPointerCapture(event.pointerId);
			});
			element.addEventListener('pointermove', (event) => {
				const body = pet.physics;
				if (!body.dragging || body.pointerId !== event.pointerId) return;
				const x = Math.max(0, Math.min(Math.max(0, world.clientWidth - pet.width), event.clientX - body.offsetX));
				const y = Math.max(0, Math.min(floorY(pet), event.clientY - body.offsetY));
				if (Math.abs(x - body.x) + Math.abs(y - body.y) > 3) body.moved = true;
				body.x = x; body.y = y;
				const t = performance.now();
				body.dragMoveEvents++;
				const dispatchDelay = t - event.timeStamp;
				if (Number.isFinite(dispatchDelay) && dispatchDelay >= 0 && dispatchDelay < 1000) {
					body.dragMaxDispatchDelayMs = Math.max(body.dragMaxDispatchDelayMs, dispatchDelay);
				}
				body.samples.push({ x: event.clientX, y: event.clientY, t });
				body.samples = body.samples.filter((sample) => t - sample.t < 110).slice(-8);
				if (!body.boundaryReported && body.moved && outsideStage(event)) {
					body.boundaryReported = true;
					sendHandoffProbe(pet, event, 'boundary');
				}
				// The existing requestAnimationFrame loop renders this position once per frame.
				// Do not also write a CSS transform for every high-rate pointer event.
			});
			const finish = (event) => {
				const body = pet.physics;
				if (!body.dragging || body.pointerId !== event.pointerId) return;
				body.dragging = false; body.pointerId = null;
				element.classList.remove('dragging');
				if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
				const first = body.samples[0];
				const last = body.samples[body.samples.length - 1];
				const dt = first && last ? Math.max(16, last.t - first.t) : 16;
				body.vx = first && last ? Math.max(-1100, Math.min(1100, (last.x - first.x) * 1000 / dt)) : 0;
				body.vy = first && last ? Math.max(-1100, Math.min(1100, (last.y - first.y) * 1000 / dt)) : 0;
				body.lastAt = performance.now();
				body.nextReturnAt = body.lastAt + 6000;
				if (event.type === 'pointerup' && body.moved && outsideStage(event)) {
					sendHandoffProbe(pet, event, 'release');
				}
				if (body.moved) { body.suppressClick = true; setTimeout(() => { body.suppressClick = false; }, 150); }
				else { body.active = false; body.x = pet.baseX; }
			};
			element.addEventListener('pointerup', finish);
			element.addEventListener('pointercancel', finish);
			element.addEventListener('dblclick', () => returnHome(pet));
		}


		function updatePhysics(pet, now) {
			const body = pet.physics;
			if (!body.active) return;
			const dt = Math.min(0.05, Math.max(0, (now - body.lastAt) / 1000));
			body.lastAt = now;
			if (body.dragging) return;
			body.vy += 1250 * dt;
			body.x += body.vx * dt;
			body.y += body.vy * dt;
			const right = Math.max(0, world.clientWidth - pet.width);
			let collided = false;
			if (body.x < 0) { body.x = 0; body.vx = Math.abs(body.vx) * 0.65; collided = true; }
			if (body.x > right) { body.x = right; body.vx = -Math.abs(body.vx) * 0.65; collided = true; }
			if (body.y < 0) { body.y = 0; body.vy = Math.abs(body.vy) * 0.60; collided = true; }
			const floor = floorY(pet);
			if (body.y >= floor) {
				body.y = floor;
				if (body.vy > 65) collided = true;
				body.vy = Math.abs(body.vy) > 65 ? -Math.abs(body.vy) * 0.56 : 0;
				body.vx *= Math.pow(0.82, dt * 30);
			}
			body.vx *= Math.pow(0.993, dt * 60);
			const preview = body.dragPreview;
			if (collided && preview && preview.flightActive && preview.bounces < 12) {
				preview.bounces++;
				preview.reportFlight('flight-bounce');
			}
			if (pet.definition.spinFrames.length && (Math.abs(body.vx) + Math.abs(body.vy) > 180) && now >= body.spinAt && pet.currentAction === null) {
				const frames = pet.definition.spinFrames;
				setFrame(pet, frames[Math.floor(now / 65) % frames.length]);
				body.spinAt = now + 40;
			}
			if (preview && preview.flightActive && now >= body.nextReturnAt) {
				returnHome(pet); // A hard local-flight deadline, even if bouncing never settles.
			} else if (now >= body.nextReturnAt && body.y >= floor && Math.abs(body.vx) < 18 && Math.abs(body.vy) < 18) {
				returnHome(pet);
			}
		}

		function updatePet(pet, now) {
			updatePhysics(pet, now);
			if (pet.bubbleHideAt > 0 && now >= pet.bubbleHideAt) hideBubble(pet);
			updateAction(pet, now);
			evaluateIdleSpriteActions(pet, now);
			if (now >= pet.nextMotionAt) {
				if (startMotion(pet, now, false)) pet.nextMotionAt = scheduleTime(now, pet.definition.motionMinIntervalMs, pet.definition.motionMaxIntervalMs);
				else if (pet.currentAction !== null) pet.nextMotionAt = now + 1000;
			}
			if (pet.currentAction === null && !(pet.physics.active && !pet.physics.dragging && Math.abs(pet.physics.vx) + Math.abs(pet.physics.vy) > 180)) setFrame(pet, pet.definition.idleFrame);
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

			if (message?.type === 'handoffProbeAck') {
				// Confirmation that the extension host saw an outside-release attempt.
				// The Fumo never leaves the panel in this diagnostic stage.
				const pet = pets.find((item) => item.definition.id === message.id);
				if (pet && message.phase === 'release' && pet.definition.handoffProbeEnabled) {
					if (pet.physics.dragPreview && pet.physics.dragPreview.pending &&
						pet.physics.handoffRequestId === message.requestId && !message.nativePending && !message.editorPending) {
						if (pet.definition.dragPreviewLocalFlightEnabled && pet.physics.dragPreview.outsideObserved) startLocalFlight(pet);
						else restorePreviewPet(pet);
					} else if (!pet.physics.dragPreview || !pet.physics.dragPreview.pending) {
						// Editor-only release: do not display a legacy handoff diagnostic.
					}
				}
				return;
			}

			if (message?.type === 'handoffOverlayStatus') {
                const pet = pets.find((item) => item.definition.id === message.id &&
                    item.physics.handoffRequestId === message.requestId);
                if (!pet) return;
                if (message.status === 'active') {
                    // Only hide once native drawing has begun, never on launch request.
                    pet.physics.dragging = false;
                    pet.physics.active = false;
                    pet.element.style.visibility = 'hidden';
                } else if (message.status === 'returned' || message.status === 'failed') {
                    if (pet.physics.dragPreview && pet.physics.dragPreview.pending) {
                        if (message.status === 'failed' && pet.definition.dragPreviewLocalFlightEnabled && pet.physics.dragPreview.outsideObserved) startLocalFlight(pet);
                        else restorePreviewPet(pet);
                    } else {
                        const hadTransferred = pet.element.style.visibility === 'hidden';
                        pet.element.style.visibility = '';
                        pet.physics.handoffRequestId = null;
                        if (hadTransferred) {
                            pet.physics.active = true;
                            returnHome(pet);
                        }
                    }
                }
                return;
            }

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
