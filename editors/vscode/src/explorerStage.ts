/**
 * @file explorerStage.ts
 * @brief Thin WebviewView providers for Explorer and Bottom Panel stages.
 *
 * Platform : VS Code / Code-OSS extension host
 * Author   : Daniel Fridman (schermaiolo)
 *
 * Both providers delegate rendering and animation to the same shared stage
 * runtime. Only their VS Code view identities differ, which avoids maintaining
 * separate behavior implementations for the two surfaces.
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

/** Webview provider used by the Explorer-side stage. */
export class ExplorerStageProvider
	implements vscode.WebviewViewProvider {

	public static readonly viewType: string =
		'touhouFumo.explorerStage';

	private view:
		vscode.WebviewView | undefined;

	public constructor(
		private readonly extensionUri:
			vscode.Uri,

		private readonly characterSettings:
			CharacterSettingsController
	) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context:
			vscode.WebviewViewResolveContext,
		_token:
			vscode.CancellationToken
	): void {
		this.view = webviewView;

		const mediaRoot = vscode.Uri.joinPath(
			this.extensionUri,
			'media'
		);

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [mediaRoot]
		};

		this.render(webviewView);

		webviewView.onDidDispose(() => {
			if (this.view === webviewView) {
				this.view = undefined;
			}
		});
	}

	public reload(): void {
		if (this.view !== undefined) {
			this.render(this.view);
		}
	}

	public reactSelected(): void {
		this.post({
			type: 'reactSelected',
			target:
				this.characterSettings
					.getSelectedCharacterId()
		});
	}

	public spinSelected(): void {
		this.post({
			type: 'spinSelected',
			target:
				this.characterSettings
					.getSelectedCharacterId()
		});
	}

	public crazySpinSelected(): void {
		this.post({
			type: 'crazySpinSelected',
			target:
				this.characterSettings
					.getSelectedCharacterId()
		});
	}

	public triggerRule(
		rule: ReactionRule,
		priorityKind: 'editor' | 'manual' = 'editor'
	): void {
		this.post({
			type: 'ruleAction',
			rule: {
				...rule,
				priorityKind
			}
		});
	}

	public show(
		preserveFocus = false
	): void {
		this.view?.show(preserveFocus);
	}

	/** Post only to a resolved, visible view; hidden stages do not accumulate events. */
	private post(message: unknown): void {
		if (
			this.view === undefined ||
			!this.view.visible
		) {
			return;
		}

		void this.view.webview.postMessage(message);
	}

	private render(
		webviewView: vscode.WebviewView
	): void {
		const pets = getExplorerPetDefinitions(
			this.extensionUri,
			webviewView.webview,
			this.characterSettings
		);

		webviewView.webview.html =
			getExplorerPetsHtml(
				webviewView.webview,
				pets
			);
	}
}

/** Same runtime as ExplorerStageProvider, exposed under a separate view ID. */
export class BottomPanelStageProvider
	extends ExplorerStageProvider {

	public static readonly viewType =
		'touhouFumo.bottomPanelStage';
}

