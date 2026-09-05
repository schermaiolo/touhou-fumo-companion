/**
 * @file codingSession.ts
 * @brief Manage the optional large Touhou Fumo editor-group webview.
 *
 * Platform : VS Code / Code-OSS extension host
 * Author   : Daniel Fridman (schermaiolo)
 *
 * This controller owns workbench layout and webview lifetime only. Character
 * definitions and animation behavior are delegated to the same modern runtime
 * used by the Explorer and Bottom Panel stages.
 */
import * as vscode from 'vscode';

import {
	getExplorerPetDefinitions
} from './explorerPets';

import {
	getExplorerPetsHtml
} from './explorerPetsHtml';

import type {
	CharacterSettingsController
} from './characterSettings';

import type {
	ReactionRule
} from './reactionRules';

/** Owns the optional webview editor and keeps it synchronized with settings. */
export class CodingSessionController
	implements vscode.Disposable {

	private panel:
		vscode.WebviewPanel | undefined;

	private characterSettings:
		CharacterSettingsController | undefined;

	public constructor(
		private readonly extensionUri: vscode.Uri
	) {}

	public get isOpen(): boolean {
		return this.panel !== undefined;
	}

	public setCharacterSettings(
		characterSettings:
			CharacterSettingsController
	): void {
		this.characterSettings =
			characterSettings;

		this.reload();
	}

	public async open(): Promise<void> {
		if (this.panel !== undefined) {
			this.panel.reveal(undefined, false);
			return;
		}

		await this.openBelow();
	}

	/**
	 * Rebuild the editor layout with a second row and create the webview there.
	 * Recreating is more reliable than trying to move an existing webview group.
	 */
	public async openBelow(): Promise<void> {
		this.close();

		const activeEditor =
			vscode.window.activeTextEditor;

		if (activeEditor !== undefined) {
			await vscode.window.showTextDocument(
				activeEditor.document,
				{
					viewColumn:
						activeEditor.viewColumn,
					preserveFocus: false,
					preview: false
				}
			);
		}

		const availableCommands =
			await vscode.commands.getCommands();

		if (
			availableCommands.includes(
				'workbench.action.editorLayoutTwoRows'
			)
		) {
			await vscode.commands.executeCommand(
				'workbench.action.editorLayoutTwoRows'
			);

			await sleep(120);

			this.createPanel(vscode.ViewColumn.Two);
			return;
		}

		if (
			availableCommands.includes(
				'workbench.action.newGroupBelow'
			)
		) {
			await vscode.commands.executeCommand(
				'workbench.action.newGroupBelow'
			);

			await sleep(120);

			this.createPanel(
				vscode.ViewColumn.Active
			);

			return;
		}

		this.createPanel(vscode.ViewColumn.Beside);
	}

	public async moveBelow(): Promise<void> {
		await this.openBelow();
	}

	public close(): void {
		const panel = this.panel;
		this.panel = undefined;
		panel?.dispose();
	}

	public reload(): void {
		if (this.panel !== undefined) {
			this.render(this.panel);
		}
	}

	public reactSelected(): void {
		if (this.characterSettings === undefined) {
			return;
		}

		this.post({
			type: 'reactSelected',
			target:
				this.characterSettings
					.getSelectedCharacterId()
		});
	}

	public spinSelected(): void {
		if (this.characterSettings === undefined) {
			return;
		}

		this.post({
			type: 'spinSelected',
			target:
				this.characterSettings
					.getSelectedCharacterId()
		});
	}

	public crazySpinSelected(): void {
		if (this.characterSettings === undefined) {
			return;
		}

		this.post({
			type: 'crazySpinSelected',
			target:
				this.characterSettings
					.getSelectedCharacterId()
		});
	}

	public triggerRule(
		rule: ReactionRule,
		priorityKind:
			'editor' | 'manual' = 'editor'
	): void {
		this.post({
			type: 'ruleAction',
			rule: {
				...rule,
				priorityKind
			}
		});
	}

	public dispose(): void {
		this.close();
	}

	/** Create the webview editor after the workbench has established its target group. */
	private createPanel(
		viewColumn: vscode.ViewColumn
	): void {
		const mediaRoot = vscode.Uri.joinPath(
			this.extensionUri,
			'media'
		);

		const panel =
			vscode.window.createWebviewPanel(
				'touhouFumo.codingSession',
				'Touhou Fumo',
				{
					viewColumn,
					preserveFocus: false
				},
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [
						mediaRoot
					]
				}
			);

		this.panel = panel;
		this.render(panel);

		panel.onDidDispose(() => {
			if (this.panel === panel) {
				this.panel = undefined;
			}
		});
	}

	/** Regenerate the shared stage document after profile/manifest changes. */
	private render(
		panel: vscode.WebviewPanel
	): void {
		if (this.characterSettings === undefined) {
			panel.webview.html = emptyHtml(
				'Touhou Fumo is still loading.'
			);
			return;
		}

		const pets =
			getExplorerPetDefinitions(
				this.extensionUri,
				panel.webview,
				this.characterSettings
			);

		panel.webview.html =
			getExplorerPetsHtml(
				panel.webview,
				pets
			);
	}

	private post(message: unknown): void {
		if (this.panel === undefined) {
			return;
		}

		void this.panel.webview.postMessage(
			message
		);
	}
}

function emptyHtml(message: string): string {
	const escaped = message
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta
		name="viewport"
		content="width=device-width, initial-scale=1.0"
	>
</head>
<body>
	<p>${escaped}</p>
</body>
</html>`;
}

function sleep(
	milliseconds: number
): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}
