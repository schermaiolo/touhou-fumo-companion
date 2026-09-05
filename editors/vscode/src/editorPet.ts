/**
 * @file editorPet.ts
 * @brief Small fumo companion rendered next to the active source line.
 *
 * Platform : VS Code / Code-OSS extension host
 * Author   : Daniel Fridman (schermaiolo)
 *
 * The Editor Pet uses text-editor decorations rather than the stage webview,
 * but consumes the same generated character definitions. The implementation
 * owns decoration lifetime, caret anchoring, intrinsic sprite scaling and the
 * short editor-reaction animations used while coding.
 */
import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';

import {
	CHARACTER_DEFINITIONS
} from './generated/characters';

import type {
	GeneratedAnimationDefinition,
	GeneratedCharacterDefinition
} from './generated/characters';

import type {
	CharacterSettingsController
} from './characterSettings';

export type CompanionMode =
	| 'editor'
	| 'panel'
	| 'both';

export type EditorReactionKind =
	| 'typing'
	| 'newline'
	| 'save'
	| 'buildStart'
	| 'buildSuccess'
	| 'buildFailure'
	| 'debugStart'
	| 'debugEnd'
	| 'manual';

export type EditorBubbleTone =
	| 'normal'
	| 'success'
	| 'error';

interface AnimationDefinition {
	readonly frames: readonly number[];
	readonly durations: readonly number[];
	readonly hold: number;
}

const DEFAULT_EDITOR_PET_SIZE = 10;
const MINIMUM_EDITOR_PET_SIZE = 6;
const MAXIMUM_EDITOR_PET_SIZE = 48;

/** Manages decoration types, animation lifetime, and active-editor anchoring. */
export class EditorPetController implements vscode.Disposable {
	private frameDecorations:
		vscode.TextEditorDecorationType[] = [];

	private bubbleDecoration:
		vscode.TextEditorDecorationType | undefined;

	private enabled = false;
	private animating = false;
	private animationGeneration = 0;
	private currentFrame = 0;
	private currentFrameIndex = 0;

	private idleTimer:
		ReturnType<typeof setTimeout> | undefined;

	private character:
		GeneratedCharacterDefinition =
			CHARACTER_DEFINITIONS[0];

	public constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly characterSettings:
			CharacterSettingsController
	) {
		this.rebuildDecorations();
	}

	public setEnabled(enabled: boolean): void {
		if (this.enabled === enabled) {
			if (enabled) {
				this.showForActiveEditor(false);
			}

			return;
		}

		this.enabled = enabled;
		this.cancelCurrentAnimation();

		if (!enabled) {
			this.clearAllDecorations();
			return;
		}

		this.showForActiveEditor(true);
	}

	public reloadSettings(): void {
		const wasEnabled = this.enabled;

		this.cancelCurrentAnimation();
		this.clearAllDecorations();
		this.disposeDecorationTypes();
		this.rebuildDecorations();

		if (wasEnabled) {
			this.showForActiveEditor(true);
		}
	}

	public onActiveEditorChanged(
		editor: vscode.TextEditor | undefined
	): void {
		if (!this.enabled) {
			return;
		}

		this.cancelCurrentAnimation();
		this.clearAllDecorations();

		if (!this.isSupportedEditor(editor)) {
			return;
		}

		void this.dropIntoEditor(editor);
	}
	/** Re-anchor after VS Code has committed the edit and advanced the caret. */
	public onDocumentChanged(editor: vscode.TextEditor): void {
		if (
			!this.enabled ||
			editor !== vscode.window.activeTextEditor ||
			!this.isSupportedEditor(editor)
		) {
			return;
		}

		setTimeout(() => {
			const activeEditor = vscode.window.activeTextEditor;

			if (
				!this.enabled ||
				activeEditor !== editor ||
				!this.isSupportedEditor(activeEditor)
			) {
				return;
			}

			this.showFrame(this.currentFrame, activeEditor);
		}, 0);
	}

	/** Keep the displayed animation frame attached to the caret after selection moves. */
	public onSelectionChanged(
		event: vscode.TextEditorSelectionChangeEvent
	): void {
		if (
			!this.enabled ||
			event.textEditor !==
				vscode.window.activeTextEditor
		) {
			return;
		}

		if (!this.isSupportedEditor(event.textEditor)) {
			this.clearAllDecorations();
			return;
		}

		/* Keep the current animation frame attached to the new caret line. */
		this.showFrame(
			this.animating
				? this.currentFrameIndex
				: this.idleFrame,
			event.textEditor,
			event.selections[0]?.active.line
		);
	}

	public react(
		reaction: EditorReactionKind,
		showCharacterMessage = false,
		tone: EditorBubbleTone = 'normal'
	): void {
		if (!this.enabled) {
			return;
		}

		void this.playReaction(
			reaction,
			showCharacterMessage,
			tone
		);
	}

	public dispose(): void {
		this.enabled = false;
		this.cancelCurrentAnimation();
		this.clearAllDecorations();
		this.disposeDecorationTypes();
	}

	private get idleFrame(): number {
		return this.character.animations.idle.frames[0] ?? 0;
	}

	private get blinkFrame(): number {
		return (
			this.character.animations.blink.frames[0] ??
			this.idleFrame
		);
	}

	private getSelectedCharacter(): GeneratedCharacterDefinition {
		const configuration =
			vscode.workspace.getConfiguration('touhouFumo');
		const fallback = CHARACTER_DEFINITIONS[0];
		const selected = configuration.get<string>(
			'editorPet.character',
			fallback.id
		);

		return CHARACTER_DEFINITIONS.find(
			(character) => character.id === selected
		) ?? fallback;
	}

	/** Recreate frame decorations when character or rendered size changes. */
	private rebuildDecorations(): void {
		this.character = this.getSelectedCharacter();
		this.currentFrame = this.idleFrame;

		const configuredSize =
			vscode.workspace
				.getConfiguration('touhouFumo')
				.get<number>(
					'editorPet.size',
					DEFAULT_EDITOR_PET_SIZE
				);

		const height = Math.max(
			MINIMUM_EDITOR_PET_SIZE,
			Math.min(MAXIMUM_EDITOR_PET_SIZE, configuredSize)
		);
		const width = Math.max(
			1,
			Math.round(
				this.character.frameWidth *
				height /
				this.character.frameHeight
			)
		);
		for (
			let frameIndex = 0;
			frameIndex < this.character.frameCount;
			frameIndex += 1
		) {
			const frameName =
				`frame-${String(frameIndex).padStart(2, '0')}.png`;
			const frameUri = vscode.Uri.joinPath(
				this.extensionUri,
				'media',
				this.character.assetDirectory,
				this.character.framesDirectory,
				frameName
			);

			const sizedFrameUri =
				this.createIntrinsicSizedIconUri(
					frameUri,
					width,
					height
				);

			this.frameDecorations.push(
				vscode.window.createTextEditorDecorationType({
					rangeBehavior:
						vscode.DecorationRangeBehavior.ClosedClosed,
					after: {
						contentIconPath: sizedFrameUri,
						margin: '0',
						textDecoration:
							'none; position: absolute; transform: translate(8px, 2px); pointer-events: none; z-index: 5;'
					}
				})
			);
		}

		this.bubbleDecoration =
			vscode.window.createTextEditorDecorationType({
				rangeBehavior:
					vscode.DecorationRangeBehavior.ClosedClosed,
				after: {
					margin: '0 0 16px 8px',
					color: new vscode.ThemeColor(
						'editorWidget.foreground'
					),
					backgroundColor: new vscode.ThemeColor(
						'editorWidget.background'
					),
					border: '1px solid',
					borderColor: new vscode.ThemeColor(
						'editorWidget.border'
					),
					fontWeight: '600'
				}
			});
	}

	/**
	 * `contentIconPath` becomes CSS `content: url(...)` in VS Code.
	 * Setting width/height on the generated pseudo-element does not reliably
	 * scale that replaced image, so make the icon resource itself have the
	 * requested intrinsic dimensions.
	 *
	 * Embedding the PNG in a tiny SVG keeps this on the public decoration API
	 * and makes a configured height such as 6 px actually render as 6 px.
	 */
	private createIntrinsicSizedIconUri(
		frameUri: vscode.Uri,
		width: number,
		height: number
	): vscode.Uri {
		const pngBase64 =
			readFileSync(frameUri.fsPath)
				.toString('base64');

		const svg = [
			'<svg xmlns="http://www.w3.org/2000/svg"',
			` width="${width}" height="${height}"`,
			` viewBox="0 0 ${width} ${height}">`,
			'<image',
			` width="${width}" height="${height}"`,
			' image-rendering="pixelated"',
			` href="data:image/png;base64,${pngBase64}"/>`,
			'</svg>'
		].join('');

		return vscode.Uri.parse(
			'data:image/svg+xml;base64,' +
			Buffer.from(svg).toString('base64')
		);
	}

	/** Render immediately or play the entrance animation for the current text editor. */
	private showForActiveEditor(withEntrance: boolean): void {
		const editor = vscode.window.activeTextEditor;

		if (!this.isSupportedEditor(editor)) {
			this.clearAllDecorations();
			return;
		}

		if (withEntrance) {
			void this.dropIntoEditor(editor);
			return;
		}

		this.showFrame(this.idleFrame, editor);
		this.scheduleIdleAnimation();
	}

	/** Play the spin-capable entrance while descending toward the active line. */
	private async dropIntoEditor(editor: vscode.TextEditor): Promise<void> {
		const generation = ++this.animationGeneration;
		this.animating = true;
		this.stopIdleTimer();
		this.clearBubbleDecorations();

		const targetLine = editor.selection.active.line;
		const firstVisibleLine =
			editor.visibleRanges[0]?.start.line ?? targetLine;
		const startLine = Math.min(firstVisibleLine, targetLine);
		const distance = Math.max(0, targetLine - startLine);
		const stepCount = Math.min(16, Math.max(4, distance));
		const spinFrames = this.character.animations.spin.frames;

		for (let step = 0; step <= stepCount; step += 1) {
			if (
				generation !== this.animationGeneration ||
				!this.enabled
			) {
				return;
			}

			const line = Math.round(
				startLine + (distance * step) / stepCount
			);
			const frame = spinFrames.length > 0
				? spinFrames[step % spinFrames.length]
				: this.idleFrame;

			this.showFrame(frame, editor, line);
			await sleep(spinFrames.length > 0 ? 45 : 35);
		}

		if (
			generation !== this.animationGeneration ||
			!this.enabled
		) {
			return;
		}

		this.showFrame(this.blinkFrame, editor, targetLine);
		await sleep(100);

		if (
			generation !== this.animationGeneration ||
			!this.enabled
		) {
			return;
		}

		this.animating = false;
		this.showFrame(this.idleFrame, vscode.window.activeTextEditor);
		this.scheduleIdleAnimation();
	}

	private async playReaction(
		reaction: EditorReactionKind,
		showCharacterMessage: boolean,
		tone: EditorBubbleTone
	): Promise<void> {
		this.stopIdleTimer();
		const generation = ++this.animationGeneration;
		this.animating = true;

		if (reaction === 'newline') {
			await sleep(25);
		}

		const editor = vscode.window.activeTextEditor;
		if (!this.isSupportedEditor(editor)) {
			this.animating = false;
			this.clearAllDecorations();
			return;
		}

		const animation = this.getReactionAnimation(reaction);

		// Editor Pet is intentionally sprite-only: messages stay on the stage surfaces.
		this.clearBubbleDecorations();

		for (let index = 0; index < animation.frames.length; index += 1) {
			if (
				generation !== this.animationGeneration ||
				!this.enabled
			) {
				return;
			}
			this.showFrame(animation.frames[index], editor);
			await sleep(animation.durations[index]);
		}

		await sleep(animation.hold);

		if (
			generation !== this.animationGeneration ||
			!this.enabled
		) {
			return;
		}

		this.clearBubbleDecorations();
		this.animating = false;
		this.showFrame(this.idleFrame, vscode.window.activeTextEditor);
		this.scheduleIdleAnimation();
	}

	private getReactionAnimation(
		reaction: EditorReactionKind
	): AnimationDefinition {
		switch (reaction) {
			case 'typing':
				return {
					frames: [this.blinkFrame, this.idleFrame],
					durations: [70, 60],
					hold: 0
				};
			case 'save':
			case 'debugEnd':
				return {
					frames: [this.idleFrame, this.blinkFrame, this.idleFrame],
					durations: [70, 180, 90],
					hold: 300
				};
			case 'buildStart':
			case 'buildFailure':
				return {
					frames: [
						this.idleFrame,
						this.blinkFrame,
						this.idleFrame,
						this.blinkFrame,
						this.idleFrame
					],
					durations: [70, 100, 70, 100, 80],
					hold: 350
				};
			case 'newline':
			case 'buildSuccess':
			case 'debugStart':
			case 'manual':
				return expandAnimation(
					this.character.animations.special,
					this.idleFrame,
					true
				);
		}
	}

	private scheduleIdleAnimation(): void {
		this.stopIdleTimer();
		if (!this.enabled) {return;}

		const delay = 4200 + Math.floor(Math.random() * 6500);
		this.idleTimer = setTimeout(() => {
			void this.playIdleAnimation();
		}, delay);
	}

	private async playIdleAnimation(): Promise<void> {
		if (!this.enabled || this.animating) {
			this.scheduleIdleAnimation();
			return;
		}

		const editor = vscode.window.activeTextEditor;
		if (!this.isSupportedEditor(editor)) {
			this.clearAllDecorations();
			this.scheduleIdleAnimation();
			return;
		}

		const generation = ++this.animationGeneration;
		this.animating = true;

		for (const [frame, duration] of [
			[this.blinkFrame, 160],
			[this.idleFrame, 90]
		] as const) {
			if (
				generation !== this.animationGeneration ||
				!this.enabled
			) {
				return;
			}
			this.showFrame(frame, editor);
			await sleep(duration);
		}

		if (
			generation !== this.animationGeneration ||
			!this.enabled
		) {
			return;
		}

		this.animating = false;
		this.showFrame(this.idleFrame, vscode.window.activeTextEditor);
		this.scheduleIdleAnimation();
	}

	private showFrame(
		frameIndex: number,
		editor: vscode.TextEditor | undefined,
		lineOverride?: number
	): void {
		if (
			!this.isSupportedEditor(editor) ||
			frameIndex < 0 ||
			frameIndex >= this.frameDecorations.length
		) {
			return;
		}

		this.currentFrameIndex = frameIndex;
		this.currentFrame = frameIndex;
		this.clearFrameDecorations();
		const range = this.getAnchorRange(editor, lineOverride);
		editor.setDecorations(
			this.frameDecorations[frameIndex],
			[range]
		);
	}

	private showBubble(
		editor: vscode.TextEditor,
		text: string,
		tone: EditorBubbleTone
	): void {
		if (this.bubbleDecoration === undefined) {return;}

		this.clearBubbleDecorations();
		const range = this.getAnchorRange(editor);
		let borderColor = new vscode.ThemeColor('editorWidget.border');

		if (tone === 'success') {
			borderColor = new vscode.ThemeColor('testing.iconPassed');
		} else if (tone === 'error') {
			borderColor = new vscode.ThemeColor('testing.iconFailed');
		}

		editor.setDecorations(this.bubbleDecoration, [{
			range,
			hoverMessage: `${this.character.name}: ${text}`,
			renderOptions: {
				after: {
					contentText: ` ${text} `,
					borderColor
				}
			}
		}]);
	}
	private getAnchorRange(
		editor: vscode.TextEditor,
		lineOverride?: number
	): vscode.Range {
		const requestedLine =
			lineOverride ?? editor.selection.active.line;
		const line = Math.max(
			0,
			Math.min(editor.document.lineCount - 1, requestedLine)
		);
		const lineInfo = editor.document.lineAt(line);

		if (lineInfo.text.length === 0) {
			return lineInfo.range;
		}

		return new vscode.Range(
			line,
			lineInfo.text.length - 1,
			line,
			lineInfo.text.length
		);
	}

	private isSupportedEditor(
		editor: vscode.TextEditor | undefined
	): editor is vscode.TextEditor {
		if (editor === undefined) {return false;}
		const scheme = editor.document.uri.scheme;
		return scheme === 'file' || scheme === 'untitled';
	}

	/** Invalidate asynchronous animation loops without leaving stale frames. */
	private cancelCurrentAnimation(): void {
		this.animationGeneration += 1;
		this.animating = false;
		this.stopIdleTimer();
		this.clearBubbleDecorations();
	}

	private stopIdleTimer(): void {
		if (this.idleTimer !== undefined) {
			clearTimeout(this.idleTimer);
			this.idleTimer = undefined;
		}
	}

	private clearFrameDecorations(): void {
		for (const editor of vscode.window.visibleTextEditors) {
			for (const decoration of this.frameDecorations) {
				editor.setDecorations(decoration, []);
			}
		}
	}

	private clearBubbleDecorations(): void {
		if (this.bubbleDecoration === undefined) {return;}
		for (const editor of vscode.window.visibleTextEditors) {
			editor.setDecorations(this.bubbleDecoration, []);
		}
	}

	private clearAllDecorations(): void {
		this.clearFrameDecorations();
		this.clearBubbleDecorations();
	}

	private disposeDecorationTypes(): void {
		for (const decoration of this.frameDecorations) {
			decoration.dispose();
		}
		this.frameDecorations = [];
		this.bubbleDecoration?.dispose();
		this.bubbleDecoration = undefined;
	}
}

function expandAnimation(
	animation: GeneratedAnimationDefinition,
	idleFrame: number,
	idleBetween: boolean
): AnimationDefinition {
	const frames: number[] = [];
	const durations: number[] = [];

	for (let loop = 0; loop < animation.loops; loop += 1) {
		for (let index = 0; index < animation.frames.length; index += 1) {
			frames.push(animation.frames[index]);
			durations.push(animation.frameDurationMs);

			const finalFrame =
				loop === animation.loops - 1 &&
				index === animation.frames.length - 1;

			if (idleBetween && !finalFrame) {
				frames.push(idleFrame);
				durations.push(140);
			}
		}
	}

	if (durations.length > 0 && animation.holdLastFrameMs > 0) {
		durations[durations.length - 1] += animation.holdLastFrameMs;
	}

	if (frames.length === 0) {
		return { frames: [idleFrame], durations: [100], hold: 0 };
	}

	return { frames, durations, hold: 0 };
}

function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}
