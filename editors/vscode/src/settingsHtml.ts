/**
 * Self-contained settings webview: rendering only, never the settings source of truth.
 * The extension host validates and saves changes before sending refreshed state.
 * A nonce-based CSP and textContent for user-controlled strings avoid HTML injection.
 */
export function getSettingsHtml(nonce: string, cspSource: string): string {
	return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${cspSource};" />
<title>Touhou Fumo Companion Settings</title>
<style nonce="${nonce}">
:root { color-scheme: light dark; }
body.vscode-dark, body.vscode-high-contrast { color-scheme: dark; }
body.vscode-light, body.vscode-high-contrast-light { color-scheme: light; }
* { box-sizing: border-box; }
body { margin:0; color:var(--vscode-foreground,#ddd); background:var(--vscode-editor-background,#1e1e1e); font-family:var(--vscode-font-family,system-ui,sans-serif); font-size:13px; line-height:1.5; }
.shell { display:grid; grid-template-columns:218px minmax(0,1fr); min-height:100vh; }
.sidebar { background:var(--vscode-sideBar-background,#252526); border-right:1px solid var(--vscode-panel-border,#383838); padding:24px 12px; }
.brand { font-size:16px; font-weight:700; padding:4px 12px 2px; }
.brand-sub { color:var(--vscode-descriptionForeground,#999); font-size:12px; padding:0 12px 22px; }
nav { display:grid; gap:5px; }
nav button { border:0; background:transparent; color:var(--vscode-foreground,#ddd); text-align:left; width:100%; padding:11px 13px; border-radius:7px; cursor:pointer; font:inherit; }
nav button:hover { background:var(--vscode-list-hoverBackground,#333); }
nav button.selected { color:var(--vscode-list-activeSelectionForeground,#fff); background:var(--vscode-list-activeSelectionBackground,#094771); font-weight:600; }
.sidebar-foot { margin:24px 12px; color:var(--vscode-descriptionForeground,#999); font-size:11px; }
main { max-width:970px; width:100%; margin:0 auto; padding:35px 42px 75px; min-width:0; }
h1 { font-size:25px; margin:0 0 6px; font-weight:650; letter-spacing:-0.4px; }
h2 { font-size:15px; margin:0 0 15px; }
p { margin:0; }
.intro { color:var(--vscode-descriptionForeground,#999); margin-bottom:28px; max-width:710px; }
.grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
.card { background:var(--vscode-editorWidget-background,#252526); border:1px solid var(--vscode-panel-border,#383838); border-radius:11px; padding:20px; margin-bottom:17px; }
.card-heading { font-size:15px; font-weight:650; margin-bottom:5px; }
.card-sub { color:var(--vscode-descriptionForeground,#999); margin-bottom:15px; }
.setting { padding:15px 0; border-bottom:1px solid var(--vscode-panel-border,#383838); min-width:0; }
.setting:last-child { border-bottom:0; padding-bottom:0; }
.setting:first-of-type { padding-top:2px; }
.setting label { display:block; font-weight:600; margin-bottom:5px; }
.setting .description { color:var(--vscode-descriptionForeground,#999); font-size:12px; margin-bottom:10px; }
.setting .checkbox-row { display:flex; align-items:center; gap:11px; }
.setting .checkbox-row label { margin:0; }
.setting .checkbox-row input { width:17px; height:17px; accent-color:var(--vscode-button-background,#0e639c); cursor:pointer; }
input[type=text], input[type=number], select, textarea { max-width:100%; width:min(420px,100%); min-height:32px; padding:7px 10px; border:1px solid var(--vscode-input-border,var(--vscode-panel-border,#383838)); border-radius:5px; font:inherit; color:var(--vscode-input-foreground,#ddd); background:var(--vscode-input-background,#333); }
input[type=number] { width:160px; }
textarea { resize:vertical; min-height:66px; }
input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible { outline:2px solid var(--vscode-focusBorder,#007fd4); outline-offset:2px; }
.action { background:var(--vscode-button-background,#0e639c); color:var(--vscode-button-foreground,#fff); border:0; border-radius:5px; padding:8px 12px; cursor:pointer; font:inherit; }
.action:hover { background:var(--vscode-button-hoverBackground,#1177bb); }
.secondary { background:var(--vscode-button-secondaryBackground,#3a3d41); color:var(--vscode-button-secondaryForeground,#ddd); }
.secondary:hover { background:var(--vscode-button-secondaryHoverBackground,#45494e); }
.helper { color:var(--vscode-descriptionForeground,#999); font-size:12px; }
.picker { margin-bottom:22px; }
.picker label { font-weight:650; display:block; margin-bottom:7px; }
.rule-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:9px; margin-bottom:24px; }
.rule-button { background:var(--vscode-input-background,#333); border:1px solid var(--vscode-panel-border,#383838); padding:10px; border-radius:7px; color:var(--vscode-foreground,#ddd); cursor:pointer; text-align:left; font:inherit; min-height:53px; }
.rule-button strong { display:block; }
.rule-button span { font-size:11px; color:var(--vscode-descriptionForeground,#999); }
.rule-button.selected { outline:2px solid var(--vscode-focusBorder,#007fd4); }
.rule-button.disabled { opacity:0.72; }
.toolbar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:22px; }
#status { font-size:12px; color:var(--vscode-descriptionForeground,#999); }
#status.error { color:var(--vscode-errorForeground,#f48771); }
.disclosure { display:block; margin:8px 0 16px; color:var(--vscode-textLink-foreground,#3794ff); cursor:pointer; background:transparent; border:0; padding:4px 0; font:inherit; }
.empty { padding:15px; color:var(--vscode-descriptionForeground,#999); }
.inherited { opacity:.64; }
.inherited input, .inherited select { cursor:not-allowed; }
.inherit-note, .scope-note { font-size:11px; color:var(--vscode-descriptionForeground,#999); padding-top:4px; }
.character-layout { display:grid; grid-template-columns:minmax(0,1fr) 146px; gap:20px; align-items:start; }
.character-info { min-width:0; }
.fumo-preview { border:1px solid var(--vscode-panel-border,#383838); background:var(--vscode-editor-background,#1e1e1e); border-radius:10px; display:flex; align-items:center; flex-direction:column; justify-content:center; gap:9px; padding:13px 9px; }
.fumo-preview img { width:auto; height:auto; max-width:116px; max-height:124px; object-fit:contain; image-rendering:pixelated; }
.fumo-preview .helper { text-align:center; }
.rule-stats { margin:0 0 12px; color:var(--vscode-descriptionForeground,#999); font-size:12px; }
.rule-button .rule-action { display:block; margin-top:3px; font-size:11px; overflow-wrap:anywhere; }
.rule-button.active { border-color:var(--vscode-focusBorder,#007fd4); }
.rule-button.disabled { opacity:.72; }
.advanced-native { margin-top:25px; border-top:1px solid var(--vscode-panel-border,#383838); padding-top:19px; }
@media (max-width:620px) { .character-layout { grid-template-columns:minmax(0,1fr); } .fumo-preview { width:150px; } }
@media (max-width:840px) { .shell { grid-template-columns:1fr; } .sidebar { position:static; border-right:0; border-bottom:1px solid var(--vscode-panel-border,#383838); padding:12px; } .brand-sub, .sidebar-foot { display:none; } nav { grid-template-columns:repeat(5,minmax(0,1fr)); gap:2px; } nav button { padding:8px 4px; text-align:center; font-size:11px; } main { padding:23px 18px 50px; } .grid { grid-template-columns:1fr; } }
@media (max-width:520px) { .rule-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
</style>
</head>
<body>
<div class="shell"><aside class="sidebar"><div class="brand">Touhou Fumo Companion</div><div class="brand-sub">Settings · Customize your Fumos</div><nav id="navigation" aria-label="Settings sections"></nav><div class="sidebar-foot">Changes are saved automatically.</div></aside>
<main><div class="toolbar"><span id="status" role="status" aria-live="polite">Loading settings…</span></div><div id="content"></div></main></div>
<script nonce="${nonce}">
'use strict';
const vscode = acquireVsCodeApi();
const navigation = document.getElementById('navigation');
const content = document.getElementById('content');
const status = document.getElementById('status');
const sections = [
  ['basics','Basics','Choose where Fumos appear and which small companions to show.'],
  ['characters','Fumos','Customize one Fumo at a time. Each Fumo keeps her own settings.'],
  ['movement','Movement','Tune grabbing, throwing, bouncing, and global idle-animation defaults.'],
  ['reactions','Reaction Rules','Choose one of twelve rules to control how Fumos react to coding events.'],
  ['advanced','Advanced','Less frequently used preferences, including animation priorities.']
];
let section = 'basics';
let snapshot = null;
let currentCharacter = '';
let currentRule = 1;
let characterDetails = false;
let firstLoad = true;
let lastNativeCharacter = '';
let lastNativeRule = 1;
const node = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = String(text);
  return el;
};
function send(payload) { status.textContent = 'Saving…'; status.classList.remove('error'); vscode.postMessage(payload); }
function add(parent, child) { parent.appendChild(child); return child; }
function title(parent, heading, description) {
  add(parent, node('h1', '', heading));
  add(parent, node('p', 'intro', description));
}
function card(parent, heading, description) {
  const el = add(parent, node('section', 'card'));
  add(el, node('div', 'card-heading', heading));
  if (description) add(el, node('p', 'card-sub', description));
  return el;
}
function control(parent, field, value, domain, owner, options = {}) {
  const wrap = add(parent, node('div', options.disabled ? 'setting inherited' : 'setting'));
  const id = 'field-' + field.key.replace(/[^a-zA-Z0-9]/g, '-') + '-' + (owner ?? 'general');
  const onUpdate = (newValue) => {
    const data = {type:'update', domain, field: field.key, value:newValue};
    if (domain === 'character') data.character = owner;
    if (domain === 'rule') data.rule = owner;
    send(data);
  };
  if (field.type === 'boolean') {
    const row = add(wrap, node('div', 'checkbox-row'));
    const input = add(row, node('input'));
    input.type = 'checkbox'; input.id = id; input.checked = value === true;
    input.disabled = options.disabled === true;
    input.addEventListener('change', () => onUpdate(input.checked));
    const label = add(row, node('label', '', field.label)); label.htmlFor = id;
    if (field.description) add(wrap, node('p', 'description', field.description));
    annotations(wrap, field, domain, options);
    return;
  }
  const label = add(wrap, node('label', '', field.label)); label.htmlFor = id;
  if (field.description) add(wrap, node('p', 'description', field.description));
  let input;
  if (field.options && field.options.length) {
    input = add(wrap, node('select'));
    field.options.forEach(option => {
      const raw = String(option.value);
      const opt = add(input, node('option', '', option.label.split(' — ')[0]));
      opt.value = raw; opt.title = option.label;
    });
    input.value = String(value ?? '');
  } else if (field.type === 'number') {
    input = add(wrap, node('input')); input.type = 'number'; input.step = '1';
    if (field.min !== undefined) input.min = String(field.min);
    if (field.max !== undefined) input.max = String(field.max);
    input.value = String(value ?? 0);
  } else if (['characterSettings.manualMessage','reactionRules.text'].includes(field.key)) {
    input = add(wrap, node('textarea')); input.rows = 2; input.maxLength = 1024;
    input.value = String(value ?? '');
  } else {
    input = add(wrap, node('input')); input.type = 'text'; input.maxLength = 1024;
    input.value = String(value ?? '');
  }
  input.id = id; input.disabled = options.disabled === true;
  annotations(wrap, field, domain, options);
  if (field.key.endsWith('.priorityPreset')) {
    const explanations = {
      'standard': 'Manual → Editor reaction → Crazy spin → Spin → Unique → Blink',
      'special-first': 'Manual → Editor reaction → Unique → Crazy spin → Spin → Blink',
      'quiet': 'Manual → Editor reaction → Blink → Unique → Spin → Crazy spin'
    };
    add(wrap,node('p','helper',explanations[value] ?? 'Choose the preferred animation order.'));
  }
  input.addEventListener('change', () => {
    const raw = input.value;
    const options = field.options ?? [];
    let converted = field.type === 'number' ? Number(raw) : raw;
    if (field.type === 'number' && raw.trim() === '') return;
    if (options.length) { const match = options.find(opt => String(opt.value) === raw); if (match) converted = match.value; }
    onUpdate(converted);
  });
}
function annotations(wrap, field, domain, options) {
  if (options.disabled) add(wrap, node('div','inherit-note','Inherited from global defaults in Movement.'));
  if (domain === 'config' && snapshot.scopes?.[field.key] === 'workspace') {
    add(wrap, node('div','scope-note','Workspace override · saved to this workspace'));
  }
}
function generalFields(container, sectionName) {
  const list = snapshot.fields.filter(item => item.section === sectionName);
  if (!list.length) { add(container, node('p', 'empty', 'No preferences in this section.')); return; }
  list.forEach(field => control(container, field, snapshot.values[field.key], 'config'));
}
function drawBasics() {
  const groups = [
    ['Where Fumos appear','Choose a stage or session for your companions.', [
      'explorerStage.enabled','bottomPanel.enabled','codingSession.enabled','codingSession.autoStart']],
    ['Small Editor Pet','A tiny companion beside your current line of code.', [
      'editorPet.enabled','editorPet.character','editorPet.size']]
  ];
  for (const [heading, description, keys] of groups) {
    const sectionCard = card(content, heading, description);
    keys.forEach(key => {
      const field = snapshot.fields.find(item=>item.key===key);
      if (field) control(sectionCard,field,snapshot.values[field.key],'config',undefined,
        {disabled:key==='codingSession.autoStart' && !snapshot.values['codingSession.enabled']});
    });
  }
}
function drawMovement() {
  const first = snapshot.fields.filter(item => item.section === 'movement' &&
    (item.key.startsWith('physics.') || item.key.startsWith('editorFlight.')));
  const throws = card(content, 'Grab & throw', 'The text editor is the preferred flight area when enabled. Otherwise, Fumos stay in their originating panel.');
  first.forEach(field => control(throws,field,snapshot.values[field.key],'config'));
  const idle = card(content, 'Global size & idle animations', 'These defaults affect only Fumos with “Use general defaults” enabled in the Fumos tab. Individual settings take priority otherwise.');
  const defaultSize = snapshot.fields.find(item=>item.key==='defaults.size');
  if (defaultSize) control(idle,defaultSize,snapshot.values[defaultSize.key],'config');
  snapshot.fields.filter(item => item.section === 'movement' && !first.includes(item))
    .forEach(field => control(idle,field,snapshot.values[field.key],'config'));
}
function drawCharacters() {
  const picker = add(content,node('div','picker'));
  const label = add(picker,node('label','','Choose a Fumo')); label.htmlFor = 'character-select';
  const select = add(picker,node('select')); select.id='character-select';
  snapshot.characters.forEach(c => { const option = add(select,node('option','',c.name)); option.value=c.id; });
  if (!snapshot.characters.some(c => c.id === currentCharacter)) currentCharacter = snapshot.characters[0]?.id ?? '';
  select.value = currentCharacter;
  select.addEventListener('change', () => {
    currentCharacter=select.value;
    send({type:'select',selection:'character',value:currentCharacter});
    render();
  });
  const data = snapshot.profiles[currentCharacter];
  if (!data) return;
  const character = snapshot.characters.find(c=>c.id===currentCharacter);
  const profile = card(content,character?.name ?? 'Fumo settings','Changes affect only this Fumo. Existing profiles are preserved.');
  const layout = add(profile,node('div','character-layout'));
  const info = add(layout,node('div','character-info'));
  const preview = add(layout,node('div','fumo-preview'));
  if (character?.previewUri) {
    const img = add(preview,node('img'));
    img.src = character.previewUri;
    img.alt = (character.name ?? 'Fumo') + ' sprite preview';
    img.loading = 'lazy'; img.decoding = 'async';
    img.title = 'Original idle sprite, from the extension assets';
  }
  add(preview,node('div','helper','Fumo preview'));
  const inherits = data.useGeneralDefaults === true;
  add(info,node('p','helper',inherits
    ? 'Using global size and idle-animation defaults from Movement.'
    : 'Using this Fumo’s own size and idle-animation settings.'));
  const names = ['enabled','useGeneralDefaults','size','manualMessage','idleMovement'];
  const inherited = new Set(['size','idleMovement','idleMovementFrequency','randomSpecial',
    'randomSpin','crazySpin','priorityPreset']);
  const list = snapshot.fields.filter(item=>item.section==='characters');
  names.forEach(name=> { const descriptor=list.find(item=>item.key==='characterSettings.'+name);
    if (descriptor) control(info,descriptor,data[name],'character',currentCharacter,
      {disabled: inherits && inherited.has(name)}); });
  const btn = add(info,node('button','disclosure',characterDetails ? 'Hide advanced Fumo options' : 'Show advanced Fumo options'));
  btn.type='button'; btn.setAttribute('aria-expanded', String(characterDetails));
  btn.addEventListener('click',()=>{characterDetails=!characterDetails;render();});
  if (characterDetails) list.filter(item=>!names.includes(item.key.slice('characterSettings.'.length)) && !item.key.endsWith('.selected'))
    .forEach(item=> {
      const name = item.key.slice('characterSettings.'.length);
      control(info,item,data[name],'character',currentCharacter,
        {disabled: inherits && inherited.has(name)});
    });
}
function ruleOptionLabel(key, value) {
  const field = snapshot.fields.find(item => item.key === key);
  const option = field?.options?.find(item => item.value === value);
  return String(option?.label ?? value ?? 'Unknown').split(' — ')[0];
}
function drawReactions() {
  const enabled = snapshot.rules.reduce((count,rule)=> count + (rule.enabled ? 1 : 0), 0);
  add(content,node('p','rule-stats',enabled+' of '+snapshot.rules.length+' rules enabled · enabled rules shown first'));
  const grid = add(content,node('div','rule-grid'));
  const order = snapshot.rules.map((rule,index)=>({rule,index}))
    .sort((a,b)=>Number(b.rule.enabled)-Number(a.rule.enabled) || a.index-b.index);
  order.forEach(({rule,index})=>{
    const number = index+1;
    const button = add(grid,node('button','rule-button'+(number===currentRule?' selected':'')+(rule.enabled?' active':' disabled')));
    button.type='button'; button.setAttribute('aria-pressed',String(number===currentRule));
    add(button,node('strong','', 'Rule '+number+' · '+(rule.enabled?'On':'Off')));
    add(button,node('span','',ruleOptionLabel('reactionRules.trigger',rule.trigger)));
    add(button,node('span','rule-action','→ '+ruleOptionLabel('reactionRules.action',rule.action)));
    button.addEventListener('click',()=>{
      currentRule=number;
      send({type:'select',selection:'rule',value:currentRule});
      render();
    });
  });
  const rule = snapshot.rules[currentRule-1]; if (!rule) return;
  const panel = card(content,'Rule '+currentRule,'Pick a trigger, target and action. Rule numbers and stored slots never change when sorted.');
  snapshot.fields.filter(field=>field.section==='reactions' && !field.key.endsWith('.selected'))
    .filter(field=>field.key!=='reactionRules.triggerText' || rule.trigger==='text')
    .forEach(field=>control(panel,field,rule[field.key.slice('reactionRules.'.length)],'rule',currentRule));
  add(panel,node('p','helper','Conflicting enabled rules for the same trigger and target are disabled automatically.'));
}
function drawAdvanced() {
  const panel = card(content,'Advanced options','Most users can leave these unchanged.');
  generalFields(panel,'advanced');
  const end = add(panel,node('div','advanced-native'));
  add(end,node('p','helper','The underlying VS Code settings remain available for advanced configuration and workspace overrides.'));
  const btn=add(end,node('button','action secondary','Open Advanced VS Code Settings'));
  btn.id='native'; btn.type='button';
  btn.addEventListener('click',()=>vscode.postMessage({type:'openNative'}));
}
function render() {
  if (!snapshot) return;
  navigation.replaceChildren(); content.replaceChildren();
  for (const [id, label] of sections) {
    const btn = add(navigation,node('button',id===section?'selected':'',label));
    btn.type='button'; btn.setAttribute('aria-current',id===section?'page':'false');
    btn.addEventListener('click',()=>{section=id;render();});
  }
  const meta=sections.find(s=>s[0]===section);
  title(content,meta?.[1] ?? 'Settings',meta?.[2] ?? '');
  switch(section) {
    case 'basics':drawBasics();break;
    case 'movement':drawMovement();break;
    case 'characters':drawCharacters();break;
    case 'reactions':drawReactions();break;
    case 'advanced':drawAdvanced();break;
  }
}
window.addEventListener('message',(event)=>{
  const message=event.data;
  if (message?.type==='state') {
    snapshot=message.state;
    // Respect external selections made through VS Code's native settings/commands.
    if (firstLoad || snapshot.selectedCharacter !== lastNativeCharacter) {
      currentCharacter=snapshot.selectedCharacter ?? snapshot.characters[0]?.id ?? '';
      lastNativeCharacter = currentCharacter;
    }
    if (firstLoad || snapshot.selectedRule !== lastNativeRule) {
      currentRule=snapshot.selectedRule ?? 1;
      lastNativeRule = currentRule;
    }
    firstLoad=false;
    render();
    status.textContent='Settings saved automatically';status.classList.remove('error');
  } else if (message?.type==='error') {
    status.textContent=String(message.message ?? 'Could not save setting');status.classList.add('error');
  }
});
vscode.postMessage({type:'ready'});
</script>
</body>
</html>`;
}
