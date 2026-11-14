/**
 * @file settingsPanel.ts
 * @brief Dedicated, accessible settings experience for Touhou Fumo Companion.
 *
 * Configuration continues to live in the existing VS Code settings and
 * character/rule controllers. The webview does not hold durable user data.
 */
import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { CHARACTER_DEFINITIONS } from './generated/characters';
import type { CharacterSettingsController } from './characterSettings';
import type { ReactionRulesController } from './reactionRules';
import { getSettingsDescriptors, isValidSettingValue, preferredSettingsScope } from './settingsSchema';
import { getSettingsHtml } from './settingsHtml';

interface SettingsMessage {
	readonly type?: unknown;
	readonly domain?: unknown;
	readonly field?: unknown;
	readonly character?: unknown;
	readonly rule?: unknown;
	readonly value?: unknown;
	readonly selection?: unknown;
}

/** One webview window per extension host, with live configuration updates. */
export class FumoSettingsPanel implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	/** Process edits in arrival order to avoid lost updates during rapid changes. */
	private pendingMessages: Promise<void> = Promise.resolve();
	private readonly descriptors;
	private readonly subscriptions: vscode.Disposable[] = [];

	public constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly characters: CharacterSettingsController,
		private readonly reactions: ReactionRulesController,
		private readonly onCharacterChanged: () => void
	) {
		this.descriptors = getSettingsDescriptors(context.extension.packageJSON);
		this.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('touhouFumo')) {
				void this.postState();
			}
		}));
	}

	public show(): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Active);
			void this.postState();
			return;
		}
		const panel = vscode.window.createWebviewPanel(
			'touhouFumo.settings',
			'Touhou Fumo · Settings',
			vscode.ViewColumn.Active,
			{
				enableScripts: true, retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
			}
		);
		this.panel = panel;
		panel.webview.html = getSettingsHtml(
			randomBytes(18).toString('base64'), panel.webview.cspSource
		);
		panel.onDidDispose(() => {
			if (this.panel === panel) {
				this.panel = undefined;
			}
		});
		panel.webview.onDidReceiveMessage((message: unknown) => {
			this.pendingMessages = this.pendingMessages
				.then(() => this.onMessage(message))
				.catch((error: unknown) => {
					void panel.webview.postMessage({
						type: 'error',
						message: error instanceof Error ? error.message : 'Unable to save settings'
					});
				});
		});
	}

	private async onMessage(raw: unknown): Promise<void> {
		if (!raw || typeof raw !== 'object') { return; }
		const message = raw as SettingsMessage;
		if (message.type === 'ready') {
			await this.postState();
			return;
		}
		if (message.type === 'openNative') {
			await vscode.commands.executeCommand('workbench.action.openSettings', 'touhouFumo');
			return;
		}
		if (message.type === 'select') {
			const config = vscode.workspace.getConfiguration('touhouFumo');
			if (message.selection === 'character' && typeof message.value === 'string' &&
				CHARACTER_DEFINITIONS.some((item) => item.id === message.value)) {
				await config.update('characterSettings.selected', message.value,
					this.targetFor('characterSettings.selected'));
			} else if (message.selection === 'rule' && typeof message.value === 'number' &&
				Number.isInteger(message.value) && message.value >= 1 && message.value <= 12) {
				await config.update('reactionRules.selected', message.value,
					this.targetFor('reactionRules.selected'));
			} else {
				throw new Error('Invalid selection');
			}
			await this.postState();
			return;
		}
		if (message.type !== 'update' || typeof message.field !== 'string') { return; }
		const field = this.descriptors.find((item) => item.key === message.field);
		if (!field || !isValidSettingValue(field, message.value)) {
			throw new Error('Invalid settings value');
		}
		if (message.domain === 'config' &&
			field.section !== 'characters' && field.section !== 'reactions') {
			await vscode.workspace.getConfiguration('touhouFumo').update(
				message.field, message.value, this.targetFor(message.field)
			);
		} else if (message.domain === 'character' && field.section === 'characters' &&
			!field.key.endsWith('.selected') && typeof message.character === 'string' &&
			CHARACTER_DEFINITIONS.some((item) => item.id === message.character)) {
			await this.characters.setSettingsProfileField(
				message.character,
				message.field.slice('characterSettings.'.length),
				message.value
			);
			this.onCharacterChanged();
		} else if (message.domain === 'rule' && field.section === 'reactions' &&
			!field.key.endsWith('.selected') && typeof message.rule === 'number') {
			await this.reactions.setSettingsRuleField(
				message.rule,
				message.field.slice('reactionRules.'.length),
				message.value
			);
		} else {
			throw new Error('Setting is not editable in this section');
		}
		await this.postState();
	}

	/** Respect an existing workspace override instead of writing an ineffective User value. */
	private targetFor(key: string): vscode.ConfigurationTarget {
		const inspected = vscode.workspace.getConfiguration('touhouFumo').inspect(key);
		return preferredSettingsScope(inspected) === 'workspace'
			? vscode.ConfigurationTarget.Workspace
			: vscode.ConfigurationTarget.Global;
	}

	private async postState(): Promise<void> {
		if (!this.panel) { return; }
		const config = vscode.workspace.getConfiguration('touhouFumo');
		const values: Record<string, unknown> = {};
		const scopes: Record<string, 'workspace' | 'user'> = {};
		for (const field of this.descriptors) {
			if (field.section !== 'characters' && field.section !== 'reactions') {
				values[field.key] = config.get(field.key);
				scopes[field.key] = preferredSettingsScope(config.inspect(field.key));
			}
		}
		await this.panel.webview.postMessage({
			type: 'state',
			state: {
				fields: this.descriptors,
				values,
				scopes,
				characters: CHARACTER_DEFINITIONS.map((item) => ({
					id: item.id, name: item.name,
					// Reuse the shipped first idle frame; no generated/changed sprite files.
					previewUri: this.panel!.webview.asWebviewUri(vscode.Uri.joinPath(
						this.context.extensionUri, 'media', item.assetDirectory,
						item.framesDirectory, 'frame-00.png'
					)).toString(),
					frameWidth: item.frameWidth, frameHeight: item.frameHeight
				})),
				profiles: this.characters.getSettingsProfiles(),
				rules: this.reactions.getSettingsRules(),
				selectedCharacter: this.characters.getSelectedCharacterId(),
				selectedRule: config.get<number>('reactionRules.selected', 1)
			}
		});
	}

	public dispose(): void {
		this.panel?.dispose();
		for (const subscription of this.subscriptions) {
			subscription.dispose();
		}
	}
}
