/**
 * @file extension.ts
 * @brief VS Code extension entry point and event router.
 *
 * Platform : VS Code / Code-OSS extension host
 * Author   : Daniel Fridman (schermaiolo)
 *
 * Registers every user-facing surface, command and workbench/editor listener,
 * then routes events into the reaction-rule pipeline. Character animation and
 * rendering remain owned by the dedicated controllers/webview runtime so this
 * file stays focused on orchestration and lifecycle.
 */
import * as vscode from 'vscode';

import {
	EditorPetController
} from './editorPet';

import {
	CodingSessionController
} from './codingSession';

import {
	BottomPanelStageProvider,
	ExplorerStageProvider
} from './explorerStage';

import {
	CharacterSettingsController
} from './characterSettings';

import {
	ReactionRulesController
} from './reactionRules';

import type {
	ReactionTrigger
} from './reactionRules';

type ReactionKind =
	| 'typing'
	| 'newline'
	| 'save'
	| 'buildStart'
	| 'buildSuccess'
	| 'buildFailure'
	| 'debugStart'
	| 'debugEnd'
	| 'manual';

type BubbleTone =
	| 'normal'
	| 'success'
	| 'error';


const TYPING_REACTION_COOLDOWN_MS = 250;

/** Register controllers, commands, configuration listeners, and editor events. */
export function activate(
	context: vscode.ExtensionContext
): void {
	const characterSettings =
		new CharacterSettingsController(context);
	const editorPet =
		new EditorPetController(
			context.extensionUri,
			characterSettings
		);
	const codingSession =
		new CodingSessionController(
			context.extensionUri
		);
	codingSession.setCharacterSettings(
		characterSettings
	);

	const reactionRules =
		new ReactionRulesController(context);
	const explorerStage =
		new ExplorerStageProvider(
			context.extensionUri,
			characterSettings
		);
	const bottomPanelStage =
		new BottomPanelStageProvider(
			context.extensionUri,
			characterSettings
		);

	const getBooleanSetting = (
		key: string,
		fallback: boolean
	): boolean => vscode.workspace
		.getConfiguration('touhouFumo')
		.get<boolean>(key, fallback);

	const isEditorPetEnabled = (): boolean =>
		getBooleanSetting('editorPet.enabled', false);
	const isBottomPanelEnabled = (): boolean =>
		getBooleanSetting('bottomPanel.enabled', false);
	const isExplorerStageEnabled = (): boolean =>
		getBooleanSetting('explorerStage.enabled', true);
	const isCodingSessionEnabled = (): boolean =>
		getBooleanSetting('codingSession.enabled', true);

	const applyFeatures = async (): Promise<void> => {
		editorPet.setEnabled(isEditorPetEnabled());

		await vscode.commands.executeCommand(
			'setContext',
			'touhouFumo.bottomPanelEnabled',
			isBottomPanelEnabled()
		);

		await vscode.commands.executeCommand(
			'setContext',
			'touhouFumo.explorerStageEnabled',
			isExplorerStageEnabled()
		);

		if (!isCodingSessionEnabled()) {
			codingSession.close();
			return;
		}

		const autoStart = getBooleanSetting(
			'codingSession.autoStart',
			true
		);

		if (autoStart && !codingSession.isOpen) {
			await codingSession.open();
		}
	};

	/*
	 * Editor Pet uses a direct decoration-oriented reaction API. Webview stages
	 * are routed separately through the rule engine below to avoid duplicates.
	 */
	const routeEditorPetReaction = (
		reaction: ReactionKind,
		showCharacterMessage = false,
		tone: BubbleTone = 'normal',
		revealPanel = false
	): void => {
		if (isEditorPetEnabled()) {
			editorPet.react(
				reaction,
				showCharacterMessage,
				tone
			);
		}

		if (
			revealPanel &&
			isBottomPanelEnabled()
		) {
			bottomPanelStage.show(true);
		}

	};

	/*
	 * The modern rule pipeline fans one logical editor event out to every open
	 * modern surface. Each surface applies its own animation-priority policy.
	 */
	const dispatchTrigger = (
		trigger: ReactionTrigger,
		insertedText = ''
	): void => {
		const explorerEnabled =
			isExplorerStageEnabled();
		const bottomEnabled =
			isBottomPanelEnabled();
		const codingSessionOpen =
			codingSession.isOpen;

		if (
			!explorerEnabled &&
			!bottomEnabled &&
			!codingSessionOpen
		) {
			return;
		}

		const manual =
			trigger.startsWith('custom');

		for (
			const rule of reactionRules.match(
				trigger,
				insertedText
			)
		) {
			const priorityKind =
				manual ? 'manual' : 'editor';

			if (explorerEnabled) {
				explorerStage.triggerRule(
					rule,
					priorityKind
				);
			}

			if (bottomEnabled) {
				bottomPanelStage.triggerRule(
					rule,
					priorityKind
				);
			}

			if (codingSessionOpen) {
				codingSession.triggerRule(
					rule,
					priorityKind
				);
			}
		}
	};

	let lastTypingReactionAt = 0;

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			BottomPanelStageProvider.viewType,
			bottomPanelStage,
			{
				webviewOptions: {
					retainContextWhenHidden: true
				}
			}
		),

		vscode.window.registerWebviewViewProvider(
			ExplorerStageProvider.viewType,
			explorerStage,
			{
				webviewOptions: {
					retainContextWhenHidden: true
				}
			}
		),

		editorPet,
		codingSession,
		characterSettings,
		reactionRules,

		vscode.commands.registerCommand(
			'touhouFumo.startCodingSession',
			() => codingSession.open()
		),
		vscode.commands.registerCommand(
			'touhouFumo.closeCodingSession',
			() => codingSession.close()
		),
		vscode.commands.registerCommand(
			'touhouFumo.moveCodingSessionBelow',
			() => codingSession.moveBelow()
		),
		vscode.commands.registerCommand(
			'touhouFumo.spinSelected',
			() => {
				if (isExplorerStageEnabled()) {
					explorerStage.spinSelected();
				}
				if (isBottomPanelEnabled()) {
					bottomPanelStage.spinSelected();
				}
				if (codingSession.isOpen) {
					codingSession.spinSelected();
				}
			}
		),
		vscode.commands.registerCommand(
			'touhouFumo.crazySpinSelected',
			() => {
				if (isExplorerStageEnabled()) {
					explorerStage.crazySpinSelected();
				}
				if (isBottomPanelEnabled()) {
					bottomPanelStage.crazySpinSelected();
				}
				if (codingSession.isOpen) {
					codingSession.crazySpinSelected();
				}
			}
		),
		vscode.commands.registerCommand(
			'touhouFumo.openSettings',
			() => vscode.commands.executeCommand(
				'workbench.action.openSettings',
				'touhouFumo'
			)
		),

		...(['custom1', 'custom2', 'custom3', 'custom4'] as const)
			.map((trigger, index) =>
				vscode.commands.registerCommand(
					`touhouFumo.customReaction${index + 1}`,
					() => dispatchTrigger(trigger)
				)
			),

		vscode.workspace.onDidChangeConfiguration(
			(event) => {
				void (async () => {
					if (
						event.affectsConfiguration(
							'touhouFumo.editorPet'
						)
					) {
						editorPet.reloadSettings();
					}

					const characterChanged =
						await characterSettings
							.handleConfigurationChange(event);

					await reactionRules
						.handleConfigurationChange(event);

					if (characterChanged) {
						explorerStage.reload();
						bottomPanelStage.reload();
						codingSession.reload();
					}

					const featureSettingChanged =
						event.affectsConfiguration(
							'touhouFumo.explorerStage.enabled'
						) ||
						event.affectsConfiguration(
							'touhouFumo.editorPet.enabled'
						) ||
						event.affectsConfiguration(
							'touhouFumo.bottomPanel.enabled'
						) ||
						event.affectsConfiguration(
							'touhouFumo.codingSession.enabled'
						) ||
						event.affectsConfiguration(
							'touhouFumo.codingSession.autoStart'
						);

					if (featureSettingChanged) {
						await applyFeatures();
					}
				})();
			}
		),

		vscode.window.onDidChangeActiveTextEditor(
			(editor) => {
				editorPet.onActiveEditorChanged(editor);
			}
		),
		vscode.window.onDidChangeTextEditorSelection(
			(event) => {
				editorPet.onSelectionChanged(event);
			}
		),
		vscode.workspace.onDidChangeTextDocument((event) => {
			const activeEditor = vscode.window.activeTextEditor;

			if (
				activeEditor !== undefined &&
				event.document.uri.toString() ===
					activeEditor.document.uri.toString()
			) {
				editorPet.onDocumentChanged(activeEditor);
			}
		}),


		vscode.commands.registerCommand(
			'touhouFumo.reactSelected',
			() => {
				if (isExplorerStageEnabled()) {
					explorerStage.reactSelected();
				}

				if (isBottomPanelEnabled()) {
					bottomPanelStage.reactSelected();
				}

				if (codingSession.isOpen) {
					codingSession.reactSelected();
				}

				routeEditorPetReaction(
					'manual',
					true,
					'normal',
					true
				);
			}
		),

		vscode.workspace.onDidChangeTextDocument(
			(event) => {
				const activeEditor =
					vscode.window.activeTextEditor;

				if (
					activeEditor === undefined ||
					event.document.uri.toString() !==
						activeEditor.document.uri.toString() ||
					event.reason !== undefined
				) {
					return;
				}

				const insertedText = event.contentChanges
					.map((change) => change.text)
					.join('');

				if (insertedText.length === 0) {
					return;
				}

				/* Exact text triggers (for example ';') are independent. */
				dispatchTrigger('text', insertedText);

				const containsNewline =
					insertedText.includes('\n') ||
					insertedText.includes('\r');

				if (containsNewline) {
					dispatchTrigger('newline', insertedText);
					routeEditorPetReaction(
						'newline',
						true,
						'normal'
					);
					return;
				}

				const now = Date.now();
				if (
					now - lastTypingReactionAt <
					TYPING_REACTION_COOLDOWN_MS
				) {
					return;
				}

				lastTypingReactionAt = now;
				dispatchTrigger('typing', insertedText);
				routeEditorPetReaction('typing');
			}
		),

		vscode.workspace.onDidSaveTextDocument(() => {
			dispatchTrigger('save');
			routeEditorPetReaction('save', true, 'success');
		}),

		vscode.tasks.onDidStartTask((event) => {
			if (!isBuildTask(event.execution.task)) {
				return;
			}
			dispatchTrigger('buildStart');
			routeEditorPetReaction(
				'buildStart',
				true,
				'normal'
			);
		}),

		vscode.tasks.onDidEndTaskProcess((event) => {
			if (!isBuildTask(event.execution.task)) {
				return;
			}

			if (event.exitCode === 0) {
				dispatchTrigger('buildSuccess');
				routeEditorPetReaction(
						'buildSuccess',
						true,
						'success'
					);
				return;
			}

			dispatchTrigger('buildFailure');
			routeEditorPetReaction(
				'buildFailure',
				true,
				'error'
			);
		}),

		vscode.debug.onDidStartDebugSession(() => {
			dispatchTrigger('debugStart');
			routeEditorPetReaction(
				'debugStart',
				true,
				'normal'
			);
		}),

		vscode.debug.onDidTerminateDebugSession(() => {
			dispatchTrigger('debugEnd');
			routeEditorPetReaction(
				'debugEnd',
				true,
				'normal'
			);
		})
	);

	void Promise.all([
		characterSettings.initialize(),
		reactionRules.initialize()
	]).then(() => {
		explorerStage.reload();
		bottomPanelStage.reload();
		codingSession.reload();
	});

	void applyFeatures();
}

/** Accept explicit VS Code build tasks plus common build-tool task names. */
function isBuildTask(task: vscode.Task): boolean {
	if (task.group?.id === vscode.TaskGroup.Build.id) {
		return true;
	}

	const name = task.name.toLowerCase();
	return (
		name.includes('build') ||
		name.includes('compile') ||
		name.includes('make') ||
		name.includes('cmake') ||
		name.includes('ninja') ||
		name.includes('cargo')
	);
}

export function deactivate(): void {}
