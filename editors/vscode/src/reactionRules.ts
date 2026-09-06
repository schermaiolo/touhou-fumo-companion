/**
 * @file reactionRules.ts
 * @brief Persistent reaction-rule storage, migration and event matching.
 *
 * Platform : VS Code / Code-OSS extension host
 * Author   : Daniel Fridman (schermaiolo)
 *
 * Twelve reusable rule slots are edited through one native Settings UI proxy.
 * Matching is intentionally side-effect free; runtime surfaces decide how a
 * matched action is queued or preempted according to their priority policy.
 */
import * as vscode from 'vscode';

export type ReactionTrigger =
	| 'typing'
	| 'newline'
	| 'text'
	| 'save'
	| 'buildStart'
	| 'buildSuccess'
	| 'buildFailure'
	| 'debugStart'
	| 'debugEnd'
	| 'custom1'
	| 'custom2'
	| 'custom3'
	| 'custom4';

export type ReactionAction =
	| 'none'
	| 'blink'
	| 'subtle'
	| 'bouncy'
	| 'special'
	| 'spin'
	| 'crazy-spin';

export type ReactionTone =
	| 'normal'
	| 'success'
	| 'error';

/** Serializable rule edited in Settings and dispatched to runtime surfaces. */
export interface ReactionRule {
	readonly enabled: boolean;
	readonly trigger: ReactionTrigger;
	readonly triggerText: string;
	readonly target: string;
	readonly action: ReactionAction;
	readonly text: string;
	readonly tone: ReactionTone;
}

const RULE_COUNT = 12;
const STORAGE_KEY = 'touhouFumo.reactionRules.v1';
const PREFIX = 'reactionRules';

const EDITOR_FIELDS = [
	'enabled',
	'trigger',
	'triggerText',
	'target',
	'action',
	'text',
	'tone'
] as const;

const DEFAULT_RULES: readonly ReactionRule[] = [
	{
		enabled: true,
		trigger: 'typing',
		triggerText: '',
		target: 'all',
		action: 'subtle',
		text: '',
		tone: 'normal'
	},
	{
		enabled: true,
		trigger: 'newline',
		triggerText: '',
		target: 'all',
		action: 'special',
		text: '',
		tone: 'normal'
	},
	{
		enabled: true,
		trigger: 'save',
		triggerText: '',
		target: 'all',
		action: 'blink',
		text: 'Saved!',
		tone: 'success'
	},
	{
		enabled: true,
		trigger: 'buildStart',
		triggerText: '',
		target: 'all',
		action: 'bouncy',
		text: 'Building...',
		tone: 'normal'
	},
	{
		enabled: true,
		trigger: 'buildSuccess',
		triggerText: '',
		target: 'all',
		action: 'special',
		text: 'Build passed!',
		tone: 'success'
	},
	{
		enabled: true,
		trigger: 'buildFailure',
		triggerText: '',
		target: 'all',
		action: 'bouncy',
		text: 'Build failed!',
		tone: 'error'
	},
	{
		enabled: true,
		trigger: 'debugStart',
		triggerText: '',
		target: 'all',
		action: 'special',
		text: 'Debugging!',
		tone: 'normal'
	},
	{
		enabled: true,
		trigger: 'debugEnd',
		triggerText: '',
		target: 'all',
		action: 'blink',
		text: 'Debug session ended.',
		tone: 'normal'
	},
	{
		enabled: false,
		trigger: 'text',
		triggerText: ';',
		target: 'all',
		action: 'special',
		text: '',
		tone: 'normal'
	},
	{
		enabled: false,
		trigger: 'custom1',
		triggerText: '',
		target: 'all',
		action: 'special',
		text: '',
		tone: 'normal'
	},
	{
		enabled: false,
		trigger: 'custom2',
		triggerText: '',
		target: 'all',
		action: 'spin',
		text: '',
		tone: 'normal'
	},
	{
		enabled: false,
		trigger: 'custom3',
		triggerText: '',
		target: 'all',
		action: 'crazy-spin',
		text: '',
		tone: 'normal'
	}
];

/** Owns the twelve persisted rule slots and the selected-rule Settings proxy. */
export class ReactionRulesController
	implements vscode.Disposable {

	private synchronizing = false;
	private disposed = false;

	public constructor(
		private readonly context:
			vscode.ExtensionContext
	) {
		context.globalState.setKeysForSync([
			STORAGE_KEY
		]);
	}

	public async initialize(): Promise<void> {
		await this.ensureRules();
		await this.ensureSelectedRule();
		await this.loadSelectedRuleIntoEditor();
	}

	public async handleConfigurationChange(
		event: vscode.ConfigurationChangeEvent
	): Promise<boolean> {
		if (this.disposed || this.synchronizing) {
			return false;
		}

		if (
			event.affectsConfiguration(
				`touhouFumo.${PREFIX}.selected`
			)
		) {
			await this.ensureSelectedRule();
			await this.loadSelectedRuleIntoEditor();
			return false;
		}

		const changed = EDITOR_FIELDS.some(
			(field) =>
				event.affectsConfiguration(
					`touhouFumo.${PREFIX}.${field}`
				)
		);

		if (changed) {
			await this.saveEditorIntoSelectedRule();
		}

		return false;
	}

	/** Return every enabled rule matching this editor/workbench event. */
	public match(
		trigger: ReactionTrigger,
		insertedText = ''
	): ReactionRule[] {
		return this.getRules().filter((rule) => {
			if (!rule.enabled) {
				return false;
			}

			if (rule.trigger === 'text') {
				return trigger === 'text' &&
				rule.triggerText.length > 0 &&
				insertedText.includes(rule.triggerText);
			}

			return rule.trigger === trigger;
		});
	}

	public dispose(): void {
		this.disposed = true;
	}

	/** Normalize stored slots and apply conservative migrations for shipped defaults. */
	private async ensureRules(): Promise<void> {
		const current = this.context.globalState.get<ReactionRule[]>(
			STORAGE_KEY
		);

		const next: ReactionRule[] = [];

		for (let index = 0; index < RULE_COUNT; index += 1) {
			const normalized = normalizeRule(
				current?.[index],
				DEFAULT_RULES[index] ?? blankRule()
			);

			/*
			 * Older development builds shipped the default newline rule with
			 * literal text "Myon!", which made every target speak Youmu's
			 * phrase. Migrate only that untouched shipped rule; custom text is
			 * preserved. Empty newline text is resolved per character at runtime.
			 */
			if (
				index === 1 &&
				normalized.enabled &&
				normalized.trigger === 'newline' &&
				normalized.triggerText === '' &&
				normalized.target === 'all' &&
				normalized.action === 'special' &&
				normalized.text === 'Myon!' &&
				normalized.tone === 'normal'
			) {
				next.push({ ...normalized, text: '' });
				continue;
			}

			next.push(normalized);
		}

		await this.context.globalState.update(
			STORAGE_KEY,
			disableDuplicateRules(next)
		);
	}

	/** Clamp the selected rule index so stale settings cannot address a missing slot. */
	private async ensureSelectedRule(): Promise<number> {
		const configuration =
			vscode.workspace.getConfiguration('touhouFumo');
		let selected = configuration.get<number>(
			`${PREFIX}.selected`,
			1
		);

		selected = Math.max(1, Math.min(RULE_COUNT, selected));

		if (
			configuration.get<number>(`${PREFIX}.selected`) !==
			selected
		) {
			await configuration.update(
				`${PREFIX}.selected`,
				selected,
				vscode.ConfigurationTarget.Global
			);
		}

		return selected;
	}

	/** Reflect the selected stored rule into native Settings controls. */
	private async loadSelectedRuleIntoEditor(): Promise<void> {
		const selected = await this.ensureSelectedRule();
		const rule = this.getRules()[selected - 1] ?? blankRule();
		const configuration =
			vscode.workspace.getConfiguration('touhouFumo');

		this.synchronizing = true;
		try {
			await updateIfDifferent(configuration, `${PREFIX}.enabled`, rule.enabled);
			await updateIfDifferent(configuration, `${PREFIX}.trigger`, rule.trigger);
			await updateIfDifferent(configuration, `${PREFIX}.triggerText`, rule.triggerText);
			await updateIfDifferent(configuration, `${PREFIX}.target`, rule.target);
			await updateIfDifferent(configuration, `${PREFIX}.action`, rule.action);
			await updateIfDifferent(configuration, `${PREFIX}.text`, rule.text);
			await updateIfDifferent(configuration, `${PREFIX}.tone`, rule.tone);
		} finally {
			this.synchronizing = false;
		}
	}

	/** Persist the visible Settings proxy into the selected stored rule slot. */
	private async saveEditorIntoSelectedRule(): Promise<void> {
		const selected = await this.ensureSelectedRule();
		const rules = [...this.getRules()];
		const fallback = rules[selected - 1] ?? blankRule();
		const configuration =
			vscode.workspace.getConfiguration('touhouFumo');

		const editedRule = normalizeRule(
			{
				enabled: configuration.get<boolean>(
					`${PREFIX}.enabled`,
					fallback.enabled
				),
				trigger: configuration.get<string>(
					`${PREFIX}.trigger`,
					fallback.trigger
				),
				triggerText: configuration.get<string>(
					`${PREFIX}.triggerText`,
					fallback.triggerText
				),
				target: configuration.get<string>(
					`${PREFIX}.target`,
					fallback.target
				),
				action: configuration.get<string>(
					`${PREFIX}.action`,
					fallback.action
				),
				text: configuration.get<string>(
					`${PREFIX}.text`,
					fallback.text
				),
				tone: configuration.get<string>(
					`${PREFIX}.tone`,
					fallback.tone
				)
			},
			fallback
		);

		rules[selected - 1] = editedRule;

		/*
		 * One event/target pair must have one visual owner. Multiple rules for
		 * the same event and target used to fire together with identical
		 * "editor" priority, which produced order-dependent animation races.
		 * The rule being edited wins and older conflicting slots are disabled.
		 */
		if (editedRule.enabled) {
			for (let index = 0; index < rules.length; index += 1) {
				if (index === selected - 1) {
					continue;
				}

				const other = rules[index];
				if (rulesConflict(editedRule, other)) {
					rules[index] = { ...other, enabled: false };
				}
			}
		}

		await this.context.globalState.update(STORAGE_KEY, rules);
	}

	private getRules(): ReactionRule[] {
		return this.context.globalState.get<ReactionRule[]>(
			STORAGE_KEY,
			Array.from(DEFAULT_RULES)
		);
	}
}

/**
 * Keep only the first enabled rule for an identical event/target pair.
 * Typed-text rules are distinct when their trigger text differs.
 */
function disableDuplicateRules(
	rules: readonly ReactionRule[]
): ReactionRule[] {
	const seen = new Set<string>();

	return rules.map((rule) => {
		if (!rule.enabled) {
			return rule;
		}

		const key = ruleConflictKey(rule);
		if (seen.has(key)) {
			return { ...rule, enabled: false };
		}

		seen.add(key);
		return rule;
	});
}

function rulesConflict(
	left: ReactionRule,
	right: ReactionRule
): boolean {
	return right.enabled &&
		ruleConflictKey(left) === ruleConflictKey(right);
}

function ruleConflictKey(rule: ReactionRule): string {
	const triggerText = rule.trigger === 'text'
		? rule.triggerText
		: '';

	return [rule.trigger, triggerText, rule.target].join('\u0000');
}

function blankRule(): ReactionRule {
	return {
		enabled: false,
		trigger: 'text',
		triggerText: '',
		target: 'all',
		action: 'special',
		text: '',
		tone: 'normal'
	};
}

function normalizeRule(
	value: unknown,
	fallback: ReactionRule
): ReactionRule {
	if (typeof value !== 'object' || value === null) {
		return fallback;
	}

	const rule = value as Record<string, unknown>;

	return {
		enabled: typeof rule.enabled === 'boolean'
			? rule.enabled
			: fallback.enabled,
		trigger: normalizeTrigger(rule.trigger, fallback.trigger),
		triggerText: typeof rule.triggerText === 'string'
			? rule.triggerText
			: fallback.triggerText,
		target: typeof rule.target === 'string'
			? rule.target
			: fallback.target,
		action: normalizeAction(rule.action, fallback.action),
		text: typeof rule.text === 'string'
			? rule.text
			: fallback.text,
		tone: normalizeTone(rule.tone, fallback.tone)
	};
}

function normalizeTrigger(
	value: unknown,
	fallback: ReactionTrigger
): ReactionTrigger {
	const allowed: readonly ReactionTrigger[] = [
		'typing', 'newline', 'text', 'save',
		'buildStart', 'buildSuccess', 'buildFailure',
		'debugStart', 'debugEnd',
		'custom1', 'custom2', 'custom3', 'custom4'
	];

	return allowed.includes(value as ReactionTrigger)
		? value as ReactionTrigger
		: fallback;
}

function normalizeAction(
	value: unknown,
	fallback: ReactionAction
): ReactionAction {
	const allowed: readonly ReactionAction[] = [
		'none', 'blink', 'subtle', 'bouncy',
		'special', 'spin', 'crazy-spin'
	];

	return allowed.includes(value as ReactionAction)
		? value as ReactionAction
		: fallback;
}

function normalizeTone(
	value: unknown,
	fallback: ReactionTone
): ReactionTone {
	if (
		value === 'normal' ||
		value === 'success' ||
		value === 'error'
	) {
		return value;
	}

	return fallback;
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
