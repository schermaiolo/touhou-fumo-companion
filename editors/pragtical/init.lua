-- mod-version:3
-- priority:200

--[[
@file init.lua
@brief Touhou Fumo Companion runtime for Pragtical.

Platform : Pragtical 3.x
Author   : Daniel Fridman (schermaiolo)

The generated character table is the data source; this file owns native
configuration, reaction matching, animation priority, drawing and mouse input.
RootView:draw() is wrapped exactly once during plugin load. Never reinstall that
hook from commands or configuration callbacks.
]]

local core = require "core"
local command = require "core.command"
local common = require "core.common"
local config = require "core.config"
local style = require "core.style"
local RootView = require "core.rootview"

local DocView = nil
pcall(function()
  DocView = require "core.docview"
end)

-----------------------------------------------------------------------
-- PLUGIN DIRECTORY AND GENERATED CHARACTER DATA
-----------------------------------------------------------------------

local source = debug.getinfo(1, "S").source
if source:sub(1, 1) == "@" then source = source:sub(2) end

local plugin_dir =
  source:match("^(.*)[/\\][^/\\]+$") or "."

local character_definitions =
  dofile(plugin_dir .. "/generated/characters.lua")

-----------------------------------------------------------------------
-- CONFIGURATION
-----------------------------------------------------------------------

local function setting_key(character_id, suffix)
  return character_id .. "_" .. suffix
end

local function frequency_from_intervals(minimum, maximum)
  local midpoint = (minimum + maximum) / 2
  if midpoint <= 30 then return "frequent" end
  if midpoint <= 120 then return "normal" end
  return "rare"
end

local function random_frequency(enabled, minimum, maximum)
  if not enabled then return "off" end
  return frequency_from_intervals(minimum / 1000, maximum / 1000)
end

local function old_motion_to_idle(mode, enabled)
  if not enabled or mode == "off" then return "off" end
  if mode == "occasional-bob" then return "subtle" end
  return "bouncy"
end

local first_definition = character_definitions[1]

local default_settings = {
  enabled = true,
  left_margin = 18,
  bottom_margin = 75,
  gap = 0,
  typing_reaction_cooldown = 0.22,

  editor_pet_enabled = false,
  editor_pet_character =
    first_definition and first_definition.id or "",
  editor_pet_size = 40,

  default_size = 100,
  default_idle_movement = "bouncy",
  default_idle_movement_frequency = "normal",
  default_random_special = "normal",
  default_random_spin = "off",
  default_crazy_spin = "off",
  default_priority_preset = "standard",

  settings_character =
    first_definition and first_definition.id or "",
  selected_character =
    first_definition and first_definition.id or "",

  selected_rule = 1,
  selected_rule_enabled = true,
  selected_rule_trigger = "typing",
  selected_rule_trigger_text = "",
  selected_rule_target = "all",
  selected_rule_action = "subtle",
  selected_rule_text = "",
  selected_rule_tone = "normal"
}

local character_choices = {}
local character_ids = {}

for _, definition in ipairs(character_definitions) do
  local id = definition.id
  local motion = definition.behavior.motion
  local special = definition.behavior.randomSpecial
  local spin = definition.behavior.randomSpin

  table.insert(character_choices, { definition.name, id })
  character_ids[id] = true

  -- Fresh installs follow the manifest. Existing saved per-character values
  -- are merged over this table below and remain intact.
  default_settings[setting_key(id, "enabled")] =
    definition.enabled_by_default == true
  default_settings[setting_key(id, "use_general_defaults")] = false
  default_settings[setting_key(id, "size")] =
    definition.default_display_height
  default_settings[setting_key(id, "idle_movement")] =
    old_motion_to_idle(motion.mode, motion.enabled)
  default_settings[setting_key(id, "idle_movement_frequency")] =
    frequency_from_intervals(
      motion.minIntervalMs / 1000,
      motion.maxIntervalMs / 1000
    )
  default_settings[setting_key(id, "random_special")] =
    random_frequency(
      special.enabled,
      special.minIntervalMs,
      special.maxIntervalMs
    )
  default_settings[setting_key(id, "random_spin")] =
    random_frequency(
      spin.enabled,
      spin.minIntervalMs,
      spin.maxIntervalMs
    )
  default_settings[setting_key(id, "crazy_spin")] = "off"
  default_settings[setting_key(id, "priority_preset")] = "standard"
  default_settings[setting_key(id, "manual_message")] =
    definition.manual_text or ""
end

local default_rules = {
  { true, "typing", "", "all", "subtle", "", "normal" },
  { true, "newline", "", "all", "special", "Myon!", "normal" },
  { true, "save", "", "all", "blink", "Saved!", "success" },
  { true, "buildStart", "", "all", "bouncy", "Building...", "normal" },
  { true, "buildSuccess", "", "all", "special", "Build passed!", "success" },
  { true, "buildFailure", "", "all", "bouncy", "Build failed!", "error" },
  { true, "debugStart", "", "all", "special", "Debugging!", "normal" },
  { true, "debugEnd", "", "all", "blink", "Debug session ended.", "normal" },
  { false, "text", ";", "all", "special", "", "normal" },
  { false, "custom1", "", "all", "special", "", "normal" },
  { false, "custom2", "", "all", "spin", "", "normal" },
  { false, "custom3", "", "all", "crazy-spin", "", "normal" }
}

for index, rule in ipairs(default_rules) do
  local prefix = "rule_" .. index .. "_"
  default_settings[prefix .. "enabled"] = rule[1]
  default_settings[prefix .. "trigger"] = rule[2]
  default_settings[prefix .. "trigger_text"] = rule[3]
  default_settings[prefix .. "target"] = rule[4]
  default_settings[prefix .. "action"] = rule[5]
  default_settings[prefix .. "text"] = rule[6]
  default_settings[prefix .. "tone"] = rule[7]
end

local frequency_values = {
  { "Rare", "rare" },
  { "Normal", "normal" },
  { "Frequent", "frequent" }
}

local random_frequency_values = {
  { "Off", "off" },
  { "Rare", "rare" },
  { "Normal", "normal" },
  { "Frequent", "frequent" }
}

local movement_values = {
  { "Off", "off" },
  { "Subtle", "subtle" },
  { "Bouncy", "bouncy" }
}

local priority_values = {
  {
    "Standard - Manual > Editor > Crazy Spin > Spin > Unique > Blink",
    "standard"
  },
  {
    "Special-first - Manual > Editor > Unique > Crazy Spin > Spin > Blink",
    "special-first"
  },
  {
    "Quiet - Manual > Editor > Blink > Unique > Spin > Crazy Spin",
    "quiet"
  }
}

local rule_trigger_values = {
  { "Typing", "typing" },
  { "Newline / Enter", "newline" },
  { "Typed Text", "text" },
  { "Save", "save" },
  { "Build Start", "buildStart" },
  { "Build Success", "buildSuccess" },
  { "Build Failure", "buildFailure" },
  { "Debug Start", "debugStart" },
  { "Debug End", "debugEnd" },
  { "Custom Reaction 1", "custom1" },
  { "Custom Reaction 2", "custom2" },
  { "Custom Reaction 3", "custom3" },
  { "Custom Reaction 4", "custom4" }
}

local rule_action_values = {
  { "Message only / None", "none" },
  { "Blink", "blink" },
  { "Subtle movement", "subtle" },
  { "Bouncy movement", "bouncy" },
  { "Unique animation", "special" },
  { "Spin", "spin" },
  { "Crazy Spin", "crazy-spin" }
}

local rule_target_values = {
  { "All enabled fumos", "all" },
  { "Random enabled fumo", "random" }
}
for _, definition in ipairs(character_definitions) do
  table.insert(rule_target_values, { definition.name, definition.id })
end

local rule_slot_values = {}
for index = 1, #default_rules do
  table.insert(rule_slot_values, { "Rule " .. index, index })
end

-- Build a dedicated generated settings view for one character. The option
-- paths intentionally keep the existing flat storage keys (for example
-- `youmu_enabled`) so current user settings remain fully compatible.
local function character_config_spec(definition)
  local id = definition.id

  return {
    name = definition.name .. " Settings",

    {
      label = "Enabled",
      description = "Show " .. definition.name .. " on the stage.",
      path = setting_key(id, "enabled"),
      type = "toggle",
      default = default_settings[setting_key(id, "enabled")]
    },
    {
      label = "Use General Defaults",
      description = "Use the general size and behavior settings. Enabled and Manual Message stay individual.",
      path = setting_key(id, "use_general_defaults"),
      type = "toggle",
      default = default_settings[setting_key(id, "use_general_defaults")]
    },
    {
      label = "Size",
      description = "Rendered height in pixels.",
      path = setting_key(id, "size"),
      type = "number",
      default = default_settings[setting_key(id, "size")],
      min = 32,
      max = 180
    },
    {
      label = "Movement",
      description = "Software idle movement.",
      path = setting_key(id, "idle_movement"),
      type = "selection",
      default = default_settings[setting_key(id, "idle_movement")],
      values = movement_values
    },
    {
      label = "Movement Frequency",
      description = "How often this fumo moves while idle.",
      path = setting_key(id, "idle_movement_frequency"),
      type = "selection",
      default = default_settings[setting_key(id, "idle_movement_frequency")],
      values = frequency_values
    },
    {
      label = "Unique Animation",
      description = "Off or frequency for the unique animation.",
      path = setting_key(id, "random_special"),
      type = "selection",
      default = default_settings[setting_key(id, "random_special")],
      values = random_frequency_values
    },
    {
      label = "Spin",
      description = "Off or frequency for normal spin.",
      path = setting_key(id, "random_spin"),
      type = "selection",
      default = default_settings[setting_key(id, "random_spin")],
      values = random_frequency_values
    },
    {
      label = "Crazy Spin",
      description = "Off or frequency for the falling crazy spin.",
      path = setting_key(id, "crazy_spin"),
      type = "selection",
      default = default_settings[setting_key(id, "crazy_spin")],
      values = random_frequency_values
    },
    {
      label = "Priority",
      description = "Ignored while Use General Defaults is enabled.",
      path = setting_key(id, "priority_preset"),
      type = "selection",
      default = default_settings[setting_key(id, "priority_preset")],
      values = priority_values
    },
    {
      label = "Manual Message",
      description = "Click/manual reaction text. Leave empty for no bubble.",
      path = setting_key(id, "manual_message"),
      type = "string",
      default = default_settings[setting_key(id, "manual_message")]
    }
  }
end

local editor_pet_config_spec = {
  name = "Editor Pet Settings",

  {
    label = "Enabled",
    description = "Show a small fumo beside the active line.",
    path = "editor_pet_enabled",
    type = "toggle",
    default = false
  },
  {
    label = "Character",
    description = "Character used beside the active line.",
    path = "editor_pet_character",
    type = "selection",
    default = first_definition and first_definition.id or "",
    values = character_choices
  },
  {
    label = "Size",
    description = "Small editor-pet height in pixels.",
    path = "editor_pet_size",
    type = "number",
    default = 40,
    min = 20,
    max = 72
  }
}

local reaction_rules_config_spec = {
  name = "Reaction Rules",

  {
    label = "Reaction Rule",
    description = "Choose one of twelve reusable reaction-rule slots.",
    path = "selected_rule",
    type = "selection",
    default = 1,
    values = rule_slot_values
  },
  {
    label = "Rule Enabled",
    description = "Enable the selected reaction rule. Only one rule can be enabled for the same trigger and target; editing/enabling a conflicting rule disables the older one.",
    path = "selected_rule_enabled",
    type = "toggle",
    default = true
  },
  {
    label = "Trigger",
    description = "Event that activates the selected rule.",
    path = "selected_rule_trigger",
    type = "selection",
    default = "typing",
    values = rule_trigger_values
  },
  {
    label = "Typed Text",
    description = "For Typed Text rules, text to react to, for example ';'.",
    path = "selected_rule_trigger_text",
    type = "string",
    default = ""
  },
  {
    label = "Target",
    description = "Which fumo receives the reaction.",
    path = "selected_rule_target",
    type = "selection",
    default = "all",
    values = rule_target_values
  },
  {
    label = "Action",
    description = "Action performed when the rule fires.",
    path = "selected_rule_action",
    type = "selection",
    default = "subtle",
    values = rule_action_values
  },
  {
    label = "Rule Text",
    description = "Optional bubble text. Empty means no bubble.",
    path = "selected_rule_text",
    type = "string",
    default = ""
  },
  {
    label = "Tone",
    description = "Bubble style.",
    path = "selected_rule_tone",
    type = "selection",
    default = "normal",
    values = {
      { "Normal", "normal" },
      { "Success", "success" },
      { "Error", "error" }
    }
  }
}

local function open_selected_character_settings()
  local plugin_settings = config.plugins.touhou_fumo or default_settings
  local selected_id = plugin_settings.settings_character
  local definition = nil

  for _, candidate in ipairs(character_definitions) do
    if candidate.id == selected_id then
      definition = candidate
      break
    end
  end

  if not definition then
    core.warn("Touhou Fumo: selected settings character is unavailable")
    return
  end

  -- Follow Pragtical's callable subconfig pattern: reuse the generated
  -- settings view while keeping the plugin context so flat character paths
  -- (for example `youmu_enabled`) resolve inside config.plugins.touhou_fumo.
  local settings_plugin = package.loaded["plugins.settings"]
  if settings_plugin and settings_plugin.show_config then
    settings_plugin.show_config(
      definition.name .. " Settings",
      character_config_spec(definition),
      "touhou_fumo"
    )
  else
    core.warn("Touhou Fumo: settings plugin not available")
  end
end

local config_spec = {
  name = "Touhou Fumo Companion",

  {
    label = "Enabled",
    description = "Show Touhou Fumo companions.",
    path = "enabled",
    type = "toggle",
    default = true
  },
  {
    label = "Left",
    description = "Horizontal distance in pixels from the left edge of the current Pragtical window. The available visible range changes when the window is resized.",
    path = "left_margin",
    type = "number",
    default = 18,
    min = 0,
    max = 500
  },
  {
    label = "Bottom",
    description = "Vertical distance in pixels from the bottom edge of the current Pragtical window. The available visible range changes when the window is resized.",
    path = "bottom_margin",
    type = "number",
    default = 75,
    min = 0,
    max = 500
  },
  {
    label = "Gap",
    description = "Space in pixels between stage fumos.",
    path = "gap",
    type = "number",
    default = 0,
    min = 0,
    max = 100
  },
  {
    label = "Default Size",
    description = "Used by characters with Use General Defaults enabled.",
    path = "default_size",
    type = "number",
    default = 100,
    min = 32,
    max = 180
  },
  {
    label = "Default Movement",
    description = "Subtle is a small bob; Bouncy is a visible hop.",
    path = "default_idle_movement",
    type = "selection",
    default = "bouncy",
    values = movement_values
  },
  {
    label = "Default Movement Frequency",
    description = "How often idle software movement happens.",
    path = "default_idle_movement_frequency",
    type = "selection",
    default = "normal",
    values = frequency_values
  },
  {
    label = "Default Unique Animation",
    description = "Random unique-animation frequency.",
    path = "default_random_special",
    type = "selection",
    default = "normal",
    values = random_frequency_values
  },
  {
    label = "Default Spin",
    description = "Characters without spin frames ignore this safely.",
    path = "default_random_spin",
    type = "selection",
    default = "off",
    values = random_frequency_values
  },
  {
    label = "Default Crazy Spin",
    description = "Drop from the top while spinning rapidly.",
    path = "default_crazy_spin",
    type = "selection",
    default = "off",
    values = random_frequency_values
  },
  {
    label = "Default Priority",
    description = "Priority used when animations compete.",
    path = "default_priority_preset",
    type = "selection",
    default = "standard",
    values = priority_values
  },

  {
    label = "Fumo to Configure",
    description = "Choose which fumo opens when Configure Fumo is pressed.",
    path = "settings_character",
    type = "selection",
    default = first_definition and first_definition.id or "",
    values = character_choices
  },
  {
    label = "Configure Fumo",
    description = "Open the selected fumo's dedicated settings page.",
    type = "button",
    on_click = open_selected_character_settings
  },
  {
    label = "Editor Pet Settings",
    description = "Configure the fumo shown beside the active line.",
    type = "subconfig",
    title = "Editor Pet Settings",
    spec = editor_pet_config_spec
  },
  {
    label = "Reaction Rules",
    description = "Configure reusable editor-event reaction rules.",
    type = "subconfig",
    title = "Reaction Rules",
    spec = reaction_rules_config_spec
  },
  {
    label = "Command Character",
    description = "Character used by the manual React, Spin and Crazy Spin commands.",
    path = "selected_character",
    type = "selection",
    default = first_definition and first_definition.id or "",
    values = character_choices
  }
}

default_settings.config_spec = config_spec

config.plugins.touhou_fumo = common.merge(
  default_settings,
  config.plugins.touhou_fumo
)

local settings = config.plugins.touhou_fumo

-- Preserve custom messages while migrating historical shipped defaults.
local legacy_manual_messages = {
  koishi = "You saw me?",
  reimu = "Reimu Hakurei"
}

for id, previous in pairs(legacy_manual_messages) do
  local key = setting_key(id, "manual_message")
  if settings[key] == previous then
    for _, definition in ipairs(character_definitions) do
      if definition.id == id then
        settings[key] = definition.manual_text or ""
        break
      end
    end
  end
end

-----------------------------------------------------------------------
-- REACTION RULE SETTINGS PROXY SYNCHRONIZATION
-----------------------------------------------------------------------

local function rule_prefix(index)
  return "rule_" .. tostring(index) .. "_"
end

-- Rules with the same event and target would otherwise fire together. Typed
-- text rules are only duplicates when their trigger text is identical too.
local function rule_conflict_key(trigger, trigger_text, target)
  local text = trigger == "text" and tostring(trigger_text or "") or ""
  return table.concat({
    tostring(trigger or ""),
    text,
    tostring(target or "all")
  }, "\30")
end

local function stored_rule_conflict_key(index)
  local prefix = rule_prefix(index)
  return rule_conflict_key(
    settings[prefix .. "trigger"],
    settings[prefix .. "trigger_text"],
    settings[prefix .. "target"]
  )
end

-- The rule currently being edited wins. Disable any older enabled rule that
-- owns the same event/target pair so a single editor event has one visual owner.
local function disable_conflicting_rules(winner_index)
  local winner_prefix = rule_prefix(winner_index)
  if settings[winner_prefix .. "enabled"] ~= true then return end

  local winner_key = stored_rule_conflict_key(winner_index)
  for index = 1, #default_rules do
    if index ~= winner_index then
      local prefix = rule_prefix(index)
      if settings[prefix .. "enabled"] == true and
         stored_rule_conflict_key(index) == winner_key then
        settings[prefix .. "enabled"] = false
      end
    end
  end
end

-- Clean up duplicate rules left by older plugin versions. Preserve the first
-- enabled slot, matching the VS Code migration behavior.
local function disable_duplicate_rules()
  local seen = {}
  for index = 1, #default_rules do
    local prefix = rule_prefix(index)
    if settings[prefix .. "enabled"] == true then
      local key = stored_rule_conflict_key(index)
      if seen[key] then
        settings[prefix .. "enabled"] = false
      else
        seen[key] = true
      end
    end
  end
end

local function selected_rule_snapshot()
  return table.concat({
    tostring(settings.selected_rule_enabled),
    tostring(settings.selected_rule_trigger),
    tostring(settings.selected_rule_trigger_text),
    tostring(settings.selected_rule_target),
    tostring(settings.selected_rule_action),
    tostring(settings.selected_rule_text),
    tostring(settings.selected_rule_tone)
  }, "\31")
end

local function save_selected_rule(index)
  index = tonumber(index)
  if not index or not default_rules[index] then return end
  local prefix = rule_prefix(index)
  settings[prefix .. "enabled"] = settings.selected_rule_enabled == true
  settings[prefix .. "trigger"] = settings.selected_rule_trigger
  settings[prefix .. "trigger_text"] = settings.selected_rule_trigger_text or ""
  settings[prefix .. "target"] = settings.selected_rule_target
  settings[prefix .. "action"] = settings.selected_rule_action
  settings[prefix .. "text"] = settings.selected_rule_text or ""
  settings[prefix .. "tone"] = settings.selected_rule_tone

  if settings[prefix .. "enabled"] == true then
    disable_conflicting_rules(index)
  end
end

local function load_selected_rule(index)
  index = tonumber(index)
  if not index or not default_rules[index] then return end
  local prefix = rule_prefix(index)
  settings.selected_rule_enabled = settings[prefix .. "enabled"] == true
  settings.selected_rule_trigger = settings[prefix .. "trigger"]
  settings.selected_rule_trigger_text = settings[prefix .. "trigger_text"] or ""
  settings.selected_rule_target = settings[prefix .. "target"]
  settings.selected_rule_action = settings[prefix .. "action"]
  settings.selected_rule_text = settings[prefix .. "text"] or ""
  settings.selected_rule_tone = settings[prefix .. "tone"]
end

-- Keep saved character selectors valid if a character disappeared.
if not character_ids[settings.settings_character] then
  settings.settings_character = first_definition and first_definition.id or ""
end
if not character_ids[settings.selected_character] then
  settings.selected_character = first_definition and first_definition.id or ""
end

-- Existing installations may already contain conflicting enabled rules.
-- Normalize them before loading the selected rule into the Settings proxy.
disable_duplicate_rules()

local last_selected_rule = tonumber(settings.selected_rule) or 1
if not default_rules[last_selected_rule] then
  last_selected_rule = 1
  settings.selected_rule = 1
end
load_selected_rule(last_selected_rule)
local last_rule_snapshot = selected_rule_snapshot()

-- Reaction rules still use a compact slot selector, so keep only that proxy
-- synchronized. Character settings are now edited directly by subconfig views.
local function sync_settings_proxies()
  local selected_rule = tonumber(settings.selected_rule) or 1
  if selected_rule ~= last_selected_rule and default_rules[selected_rule] then
    save_selected_rule(last_selected_rule)
    load_selected_rule(selected_rule)
    last_selected_rule = selected_rule
    last_rule_snapshot = selected_rule_snapshot()
    core.redraw = true
  else
    local snapshot = selected_rule_snapshot()
    if snapshot ~= last_rule_snapshot then
      save_selected_rule(selected_rule)
      last_rule_snapshot = snapshot
      core.redraw = true
    end
  end
end

-----------------------------------------------------------------------
-- HELPERS
-----------------------------------------------------------------------

local unpack = table.unpack or unpack

local function pack(...)
  return { n = select("#", ...), ... }
end

local function random_between(minimum, maximum)
  return minimum + math.random() * (maximum - minimum)
end

local function clamp(value, minimum, maximum)
  return math.max(minimum, math.min(maximum, value))
end

local function frequency_range(kind, frequency)
  local ranges = {
    motion = {
      frequent = { 2, 5 }, normal = { 10, 25 }, rare = { 45, 90 }
    },
    special = {
      frequent = { 8, 15 }, normal = { 30, 60 }, rare = { 90, 180 }
    },
    spin = {
      frequent = { 8, 15 }, normal = { 30, 60 }, rare = { 120, 240 }
    },
    crazy = {
      frequent = { 20, 40 }, normal = { 90, 180 }, rare = { 300, 600 }
    }
  }

  local group = ranges[kind]
  local selected = group[frequency] or group.normal
  return selected[1], selected[2]
end

local function frame_path(character, index)
  return string.format(
    "%s/assets/%s/frames/frame-%02d.png",
    plugin_dir,
    character,
    index
  )
end

local function load_frames(character, frame_count, target_height)
  local frames = {}
  for index = 0, frame_count - 1 do
    local path = frame_path(character, index)
    local image, error_message = canvas.load_image(path)
    if not image then
      core.error(
        "Touhou Fumo: could not load %s: %s",
        path,
        tostring(error_message)
      )
      return nil
    end

    local source_width, source_height = image:get_size()
    local target_width = math.max(
      1,
      math.floor(source_width * target_height / source_height + 0.5)
    )

    if target_width ~= source_width or target_height ~= source_height then
      image = image:scaled(target_width, target_height, "nearest")
    end

    frames[index + 1] = image
  end
  return frames
end

local function get_frame_size(frames)
  if not frames or not frames[1] then return 0, 0 end
  return frames[1]:get_size()
end

local function expand_animation(animation, idle_frame, idle_between)
  local frames = {}
  local durations = {}
  local source_frames = animation.frames or {}
  local loops = animation.loops or 1
  local total = #source_frames * loops
  local emitted = 0

  for _ = 1, loops do
    for _, frame in ipairs(source_frames) do
      emitted = emitted + 1
      table.insert(frames, frame)
      local duration = animation.frame_duration or 0.1
      if emitted == total then
        duration = duration + (animation.hold_last_frame or 0)
      end
      table.insert(durations, duration)
      if idle_between and emitted < total then
        table.insert(frames, idle_frame)
        table.insert(durations, 0.14)
      end
    end
  end

  return frames, durations
end

-----------------------------------------------------------------------
-- CHARACTER CREATION AND EFFECTIVE SETTINGS
-----------------------------------------------------------------------

local pets = {}

local function raw_pet_setting(pet, suffix)
  return settings[setting_key(pet.id, suffix)]
end

local function effective_pet_setting(pet, suffix, default_suffix)
  if suffix ~= "enabled" and suffix ~= "manual_message" and
     raw_pet_setting(pet, "use_general_defaults") == true then
    return settings["default_" .. default_suffix]
  end
  return raw_pet_setting(pet, suffix)
end

local function is_pet_enabled(pet)
  return raw_pet_setting(pet, "enabled") == true
end

local function is_editor_pet(pet)
  return settings.editor_pet_enabled == true and
    settings.editor_pet_character == pet.id
end

local function is_pet_active(pet)
  return is_pet_enabled(pet) or is_editor_pet(pet)
end

local function schedule_by_frequency(pet, kind, suffix, now)
  local frequency = effective_pet_setting(pet, suffix, suffix)
  if frequency == "off" then return math.huge end
  local minimum, maximum = frequency_range(kind, frequency)
  return now + random_between(minimum, maximum)
end

local function create_pet(definition)
  local size = clamp(
    tonumber(settings[setting_key(definition.id, "size")])
      or definition.default_display_height,
    32,
    180
  )

  local frames = load_frames(definition.id, definition.frame_count, size)
  if not frames then return nil end

  local width, height = get_frame_size(frames)
  local idle_frame = definition.animations.idle.frames[1] or 1
  local blink_frame = definition.animations.blink.frames[1] or idle_frame
  local special_frames, special_durations = expand_animation(
    definition.animations.special,
    idle_frame,
    true
  )
  local spin_frames, spin_durations = expand_animation(
    definition.animations.spin,
    idle_frame,
    false
  )
  local now = system.get_time()

  local pet = {
    id = definition.id,
    name = definition.name,
    definition = definition,
    frames = frames,
    loaded_height = size,
    width = width,
    height = height,
    idle_frame = idle_frame,
    blink_frame = blink_frame,
    special_frames = special_frames,
    special_durations = special_durations,
    spin_frames = spin_frames,
    spin_durations = spin_durations,
    current_frame = idle_frame,
    current_action = nil,
    pending_action = nil,
    motion_active = false,
    motion_started_at = 0,
    motion_duration = definition.behavior.motion.durationMs / 1000,
    motion_style = "off",
    motion_amplitude = 0,
    next_blink_at = now + random_between(5.2, 13.0),
    next_motion_at = now,
    next_special_at = now,
    next_spin_at = now,
    next_crazy_spin_at = now,
    message_text = nil,
    message_kind = "normal",
    message_until = 0,
    was_enabled = false,
    stage_hit_x = 0,
    stage_hit_y = 0,
    stage_hit_visible = false
  }

  pet.next_motion_at = schedule_by_frequency(
    pet, "motion", "idle_movement_frequency", now
  )
  pet.next_special_at = schedule_by_frequency(
    pet, "special", "random_special", now
  )
  pet.next_spin_at = schedule_by_frequency(
    pet, "spin", "random_spin", now
  )
  pet.next_crazy_spin_at = schedule_by_frequency(
    pet, "crazy", "crazy_spin", now
  )

  return pet
end

for _, definition in ipairs(character_definitions) do
  local pet = create_pet(definition)
  if pet then table.insert(pets, pet) end
end

-----------------------------------------------------------------------
-- STATE MACHINE, MOTION, BUBBLES, CRAZY SPIN
--
-- Sprite animation and software motion are separate lanes. Higher-priority
-- manual/editor actions may preempt lower-priority random work; random work
-- is rescheduled instead of queued so idle behavior cannot build a backlog.
-----------------------------------------------------------------------

local function refresh_pet_size(pet)
  local requested = clamp(
    tonumber(effective_pet_setting(pet, "size", "size"))
      or pet.definition.default_display_height,
    32,
    180
  )
  if requested == pet.loaded_height then return end

  local frames = load_frames(pet.id, pet.definition.frame_count, requested)
  if not frames then return end
  pet.frames = frames
  pet.loaded_height = requested
  pet.width, pet.height = get_frame_size(frames)
  core.redraw = true
end

local function priority_map(pet)
  local preset = effective_pet_setting(pet, "priority_preset", "priority_preset")
  if preset == "special-first" then
    return {
      manual = 600, editor = 500, special = 400,
      crazySpin = 300, spin = 200, blink = 100
    }
  end
  if preset == "quiet" then
    return {
      manual = 600, editor = 500, blink = 400,
      special = 300, spin = 200, crazySpin = 100
    }
  end
  return {
    manual = 600, editor = 500, crazySpin = 400,
    spin = 300, special = 200, blink = 100
  }
end

local function action_priority(pet, kind)
  return priority_map(pet)[kind] or 0
end

local function show_message(pet, text, kind, duration)
  if type(text) ~= "string" or text:match("^%s*$") then return end
  pet.message_text = text
  pet.message_kind = kind or "normal"
  pet.message_until = system.get_time() + (duration or 1.0)
end

local function clear_expired_messages(now)
  for _, pet in ipairs(pets) do
    if pet.message_text and now >= pet.message_until then
      pet.message_text = nil
    end
  end
end

local function make_action(priority_kind, visual_kind, frames, durations, text, tone)
  return {
    priority_kind = priority_kind,
    visual_kind = visual_kind,
    frames = frames or {},
    durations = durations or {},
    text = text,
    tone = tone or "normal"
  }
end

local function make_blink_action(pet, priority_kind, text, tone)
  return make_action(
    priority_kind,
    "blink",
    { pet.idle_frame, pet.blink_frame, pet.idle_frame },
    { 0.07, 0.18, 0.09 },
    text,
    tone
  )
end

local function make_special_action(pet, priority_kind, text, tone)
  return make_action(
    priority_kind,
    "special",
    pet.special_frames,
    pet.special_durations,
    text,
    tone
  )
end

local function make_spin_action(pet, priority_kind, text, tone)
  return make_action(
    priority_kind,
    "spin",
    pet.spin_frames,
    pet.spin_durations,
    text,
    tone
  )
end

local function make_crazy_spin_action(pet, priority_kind, text, tone)
  if #pet.spin_frames == 0 then
    return make_action(priority_kind, "crazySpin", {}, {}, text, tone)
  end

  local frames = {}
  local durations = {}
  while #frames < 32 do
    for _, frame in ipairs(pet.spin_frames) do
      table.insert(frames, frame)
      table.insert(durations, 0.04)
    end
  end

  return make_action(
    priority_kind,
    "crazySpin",
    frames,
    durations,
    text,
    tone
  )
end

local function start_action(pet, request, now)
  if not request.frames or #request.frames == 0 then return false end

  local total_duration = 0
  for _, duration in ipairs(request.durations) do
    total_duration = total_duration + (tonumber(duration) or 0.1)
  end

  request.priority = action_priority(pet, request.priority_kind)
  request.position = 1
  request.started_at = now
  request.total_duration = total_duration
  request.next_frame_at = now + (request.durations[1] or 0.1)
  pet.current_action = request
  pet.current_frame = request.frames[1]
  pet.motion_active = false
  show_message(pet, request.text, request.tone, math.max(0.8, total_duration))
  core.redraw = true
  return true
end

-- One sprite-action lane per pet: higher priority preempts; at most one best
-- blocked important action is retained. Random actions call this without queuing.
local function request_action(pet, request, now, queue_when_blocked)
  if not request.frames or #request.frames == 0 then return "unavailable" end

  request.priority = action_priority(pet, request.priority_kind)
  local current = pet.current_action
  if not current then
    start_action(pet, request, now)
    return "started"
  end

  if request.priority > current.priority then
    pet.current_action = nil
    start_action(pet, request, now)
    return "preempted"
  end

  if queue_when_blocked then
    local pending = pet.pending_action
    if not pending or request.priority >= (pending.priority or 0) then
      pet.pending_action = request
    end
    return "queued"
  end

  return "blocked"
end

local function reschedule_all(pet, now)
  pet.next_blink_at = now + random_between(5.2, 13.0)
  pet.next_motion_at = schedule_by_frequency(
    pet, "motion", "idle_movement_frequency", now
  )
  pet.next_special_at = schedule_by_frequency(
    pet, "special", "random_special", now
  )
  pet.next_spin_at = schedule_by_frequency(
    pet, "spin", "random_spin", now
  )
  pet.next_crazy_spin_at = schedule_by_frequency(
    pet, "crazy", "crazy_spin", now
  )
end

local function finish_action(pet, now)
  pet.current_action = nil
  pet.current_frame = pet.idle_frame
  local pending = pet.pending_action
  pet.pending_action = nil
  if pending then
    start_action(pet, pending, now)
    return
  end
  reschedule_all(pet, now)
end

local function update_action(pet, now)
  local action = pet.current_action
  if not action then return end
  if now < action.next_frame_at then return end

  action.position = action.position + 1
  if action.position > #action.frames then
    finish_action(pet, now)
    return
  end

  pet.current_frame = action.frames[action.position]
  action.next_frame_at =
    now + (action.durations[action.position] or 0.1)
end

local function start_motion(pet, now, forced, style_override)
  local movement = style_override or
    effective_pet_setting(pet, "idle_movement", "idle_movement")
  if movement == "off" then return false end
  if pet.current_action and not forced then return false end

  pet.motion_style = movement
  pet.motion_amplitude = movement == "subtle"
    and math.max(2, math.floor(pet.height * 0.04 + 0.5))
    or math.max(6, math.floor(pet.height * 0.12 + 0.5))
  pet.motion_duration = forced
    and math.min(0.30, pet.definition.behavior.motion.durationMs / 1000)
    or pet.definition.behavior.motion.durationMs / 1000
  pet.motion_started_at = now
  pet.motion_active = true
  return true
end

local function motion_offset(pet, now)
  if not pet.motion_active then return 0 end
  local progress =
    (now - pet.motion_started_at) / pet.motion_duration
  if progress >= 1 then
    pet.motion_active = false
    pet.next_motion_at = schedule_by_frequency(
      pet, "motion", "idle_movement_frequency", now
    )
    return 0
  end
  progress = clamp(progress, 0, 1)
  return -math.sin(math.pi * progress) * pet.motion_amplitude
end

local function crazy_y(pet, now)
  local action = pet.current_action
  if not action or action.visual_kind ~= "crazySpin" then return nil end

  local duration = math.max(0.001, action.total_duration or 1)
  local progress = clamp((now - action.started_at) / duration, 0, 1)
  local eased = progress * progress * progress
  local start_y = -pet.height - 8
  local end_y = core.root_view.size.y + pet.height + 8

  return start_y + (end_y - start_y) * eased
end

-- Evaluate due idle candidates without building a backlog. Losing candidates are
-- rescheduled rather than queued behind the action currently being displayed.
local function evaluate_random_actions(pet, now)
  local candidates = {}

  local crazy_frequency =
    effective_pet_setting(pet, "crazy_spin", "crazy_spin")
  if crazy_frequency ~= "off" and #pet.spin_frames > 0 and
     now >= pet.next_crazy_spin_at then
    table.insert(candidates, make_crazy_spin_action(pet, "crazySpin"))
  end

  local spin_frequency =
    effective_pet_setting(pet, "random_spin", "random_spin")
  if spin_frequency ~= "off" and #pet.spin_frames > 0 and
     now >= pet.next_spin_at then
    table.insert(candidates, make_spin_action(pet, "spin"))
  end

  local special_frequency =
    effective_pet_setting(pet, "random_special", "random_special")
  if special_frequency ~= "off" and now >= pet.next_special_at then
    table.insert(candidates, make_special_action(pet, "special"))
  end

  if now >= pet.next_blink_at then
    table.insert(candidates, make_blink_action(pet, "blink"))
  end

  if #candidates == 0 then return end
  table.sort(candidates, function(left, right)
    return action_priority(pet, left.priority_kind) >
      action_priority(pet, right.priority_kind)
  end)

  local candidate = candidates[1]
  request_action(pet, candidate, now, false)
  if candidate.priority_kind == "crazySpin" then
    pet.next_crazy_spin_at = schedule_by_frequency(
      pet, "crazy", "crazy_spin", now
    )
  elseif candidate.priority_kind == "spin" then
    pet.next_spin_at = schedule_by_frequency(
      pet, "spin", "random_spin", now
    )
  elseif candidate.priority_kind == "special" then
    pet.next_special_at = schedule_by_frequency(
      pet, "special", "random_special", now
    )
  elseif candidate.priority_kind == "blink" then
    pet.next_blink_at = now + random_between(5.2, 13.0)
  end
end

local function update_pet(pet, now)
  refresh_pet_size(pet)

  local stage_enabled = is_pet_enabled(pet)

  if stage_enabled and not pet.was_enabled then
    if #pet.spin_frames > 0 then
      request_action(
        pet,
        make_crazy_spin_action(pet, "manual", "", "normal"),
        now,
        true
      )
    end
    reschedule_all(pet, now)
  end

  pet.was_enabled = stage_enabled

  if not is_pet_active(pet) then return end

  update_action(pet, now)
  evaluate_random_actions(pet, now)

  if now >= pet.next_motion_at then
    if start_motion(pet, now, false) then
      pet.next_motion_at = schedule_by_frequency(
        pet, "motion", "idle_movement_frequency", now
      )
    elseif pet.current_action then
      pet.next_motion_at = now + 1
    end
  end

  if not pet.current_action then
    pet.current_frame = pet.idle_frame
  end
end

-----------------------------------------------------------------------
-- REACTION RULE ENGINE
-----------------------------------------------------------------------

local function get_rule(index)
  local prefix = rule_prefix(index)
  return {
    enabled = settings[prefix .. "enabled"] == true,
    trigger = settings[prefix .. "trigger"],
    trigger_text = settings[prefix .. "trigger_text"] or "",
    target = settings[prefix .. "target"] or "all",
    action = settings[prefix .. "action"] or "special",
    text = settings[prefix .. "text"] or "",
    tone = settings[prefix .. "tone"] or "normal"
  }
end

local function rule_matches(rule, trigger, text)
  if not rule.enabled then return false end
  if rule.trigger == "text" then
    return trigger == "text" and rule.trigger_text ~= "" and
      tostring(text or ""):find(rule.trigger_text, 1, true) ~= nil
  end
  return rule.trigger == trigger
end

local function targeted_pets(target)
  local result = {}

  if target == "random" then
    local active = {}
    for _, pet in ipairs(pets) do
      if is_pet_active(pet) then table.insert(active, pet) end
    end
    if #active > 0 then
      table.insert(result, active[math.random(1, #active)])
    end
    return result
  end

  for _, pet in ipairs(pets) do
    if is_pet_active(pet) and (target == "all" or target == pet.id) then
      table.insert(result, pet)
    end
  end
  return result
end

local function apply_rule(pet, rule, priority_kind, now)
  local action = rule.action
  if action == "subtle" or action == "bouncy" then
    start_motion(pet, now, true, action)
    show_message(pet, rule.text, rule.tone, 0.9)
    return
  end

  local request = nil
  if action == "blink" then
    request = make_blink_action(pet, priority_kind, rule.text, rule.tone)
  elseif action == "special" then
    request = make_special_action(pet, priority_kind, rule.text, rule.tone)
  elseif action == "spin" then
    request = make_spin_action(pet, priority_kind, rule.text, rule.tone)
  elseif action == "crazy-spin" then
    request = make_crazy_spin_action(pet, priority_kind, rule.text, rule.tone)
  elseif rule.text ~= "" then
    request = make_action(
      priority_kind,
      "message",
      { pet.idle_frame },
      { 0.7 },
      rule.text,
      rule.tone
    )
  end

  if request then
    request_action(pet, request, now, true)
  end
end

local function dispatch_trigger(trigger, text, manual)
  local now = system.get_time()
  for index = 1, #default_rules do
    local rule = get_rule(index)
    if rule_matches(rule, trigger, text) then
      for _, pet in ipairs(targeted_pets(rule.target)) do
        apply_rule(pet, rule, manual and "manual" or "editor", now)
      end
    end
  end
end

-----------------------------------------------------------------------
-- REACTION HOOKS
-----------------------------------------------------------------------

local last_typing_reaction_at = 0

local function command_name_suggests_newline(name)
  name = tostring(name)
  return name:find("newline", 1, true) ~= nil or
    name:find("new-line", 1, true) ~= nil or
    name:find("line-break", 1, true) ~= nil
end

local function command_name_suggests_save(name)
  name = tostring(name)
  return name == "doc:save" or
    name == "doc:save-as" or
    name == "doc:save-all" or
    name:find(":save", 1, true) ~= nil or
    name:find("save-", 1, true) ~= nil
end

if DocView and DocView.on_text_input then
  local parent_on_text_input = DocView.on_text_input

  function DocView:on_text_input(text)
    local result = parent_on_text_input(self, text)
    if text ~= nil and tostring(text) ~= "" and settings.enabled then
      local string_text = tostring(text)
      dispatch_trigger("text", string_text, false)

      local now = system.get_time()
      if now - last_typing_reaction_at >= settings.typing_reaction_cooldown then
        last_typing_reaction_at = now
        dispatch_trigger("typing", string_text, false)
      end
    end
    return result
  end

  core.log("Touhou Fumo: hooked DocView:on_text_input")
end

if command.perform then
  local parent_command_perform = command.perform

  command.perform = function(name, ...)
    local results = pack(parent_command_perform(name, ...))
    if settings.enabled then
      if command_name_suggests_newline(name) then
        dispatch_trigger("newline", "\n", false)
      elseif command_name_suggests_save(name) then
        dispatch_trigger("save", "", false)
      end
    end
    return unpack(results, 1, results.n)
  end

  core.log("Touhou Fumo: hooked command.perform")
end

-----------------------------------------------------------------------
-- ANIMATION THREAD
-----------------------------------------------------------------------

core.add_thread(function()
  while true do
    sync_settings_proxies()

    if settings.enabled then
      local now = system.get_time()
      for _, pet in ipairs(pets) do update_pet(pet, now) end
      clear_expired_messages(now)
      core.redraw = true
    end

    coroutine.yield(1 / 30)
  end
end)

-----------------------------------------------------------------------
-- DRAWING -- ROOT VIEW IS WRAPPED EXACTLY ONCE DURING PLUGIN LOAD
-----------------------------------------------------------------------

local parent_draw = RootView.draw

local function get_stage_geometry()
  local total_width = 0
  local maximum_height = 0
  local visible_count = 0

  for _, pet in ipairs(pets) do
    if is_pet_enabled(pet) then
      visible_count = visible_count + 1
      total_width = total_width + pet.width
      if visible_count > 1 then total_width = total_width + settings.gap end
      maximum_height = math.max(maximum_height, pet.height)
    end
  end

  local x = settings.left_margin
  local floor_y = core.root_view.size.y - settings.bottom_margin
  return x, floor_y, total_width, maximum_height
end

local function draw_pet_message(pet, x, y)
  if not pet.message_text then return end

  local font = style.code_font
  local width = 140
  if font.get_width then
    width = math.max(70, math.floor(font:get_width(pet.message_text) + 20))
  end
  local height = 26
  local bx = math.floor(x + pet.width / 2 - width / 2)
  local by = math.floor(y - height - 8)
  local background = { 45, 45, 52, 235 }
  local border = { 115, 115, 125, 255 }
  if pet.message_kind == "success" then border = { 90, 180, 120, 255 }
  elseif pet.message_kind == "error" then border = { 220, 90, 90, 255 } end

  renderer.draw_rect(bx, by, width, height, background)
  renderer.draw_rect(bx, by, width, 1, border)
  renderer.draw_rect(bx, by + height - 1, width, 1, border)
  renderer.draw_rect(bx, by, 1, height, border)
  renderer.draw_rect(bx + width - 1, by, 1, height, border)
  renderer.draw_text(font, pet.message_text, bx + 10, by + 6, { 235, 235, 235, 255 })
end

local editor_pet_cache = {
  character = nil,
  size = nil,
  frames = nil,
  width = 0,
  height = 0,
  x = 0,
  y = 0,
  visible = false,
  pet_id = nil
}

local function find_pet_by_id(id)
  for _, pet in ipairs(pets) do
    if pet.id == id then return pet end
  end
  return nil
end

local function ensure_editor_pet_frames(pet)
  local size = clamp(tonumber(settings.editor_pet_size) or 40, 20, 72)

  if
    editor_pet_cache.character == pet.id and
    editor_pet_cache.size == size and
    editor_pet_cache.frames
  then
    return true
  end

  local frames = load_frames(pet.id, pet.definition.frame_count, size)
  if not frames then return false end

  local width, height = get_frame_size(frames)
  editor_pet_cache.character = pet.id
  editor_pet_cache.size = size
  editor_pet_cache.frames = frames
  editor_pet_cache.width = width
  editor_pet_cache.height = height
  return true
end

-- Draw the cursor-adjacent pet inside the existing RootView draw pass. Reusing
-- this hook is critical: installing another RootView:draw wrapper causes recursion.
local function draw_editor_pet()
  editor_pet_cache.visible = false
  editor_pet_cache.pet_id = nil

  if settings.editor_pet_enabled ~= true or not DocView then return end

  local view = core.active_view
  if
    not view or
    not view.doc or
    type(view.get_line_screen_position) ~= "function" or
    type(view.get_line_height) ~= "function"
  then
    return
  end

  local pet = find_pet_by_id(settings.editor_pet_character)
  if not pet or not ensure_editor_pet_frames(pet) then return end

  local line1, col1, line2, col2 = view.doc:get_selection()
  local line = line2 or line1
  local col = col2 or col1
  if not line or not col then return end

  local x, y = view:get_line_screen_position(line, col)
  local width = editor_pet_cache.width
  local height = editor_pet_cache.height
  local line_height = view:get_line_height()

  x = x + 8
  y = y + line_height - height

  local left = view.position.x + 4
  local top = view.position.y + 4
  local right = view.position.x + view.size.x - width - 4
  local bottom = view.position.y + view.size.y - height - 4

  x = clamp(x, left, math.max(left, right))
  y = clamp(y, top, math.max(top, bottom))

  local frame =
    editor_pet_cache.frames[pet.current_frame] or
    editor_pet_cache.frames[pet.idle_frame] or
    editor_pet_cache.frames[1]

  if frame then
    editor_pet_cache.x = math.floor(x)
    editor_pet_cache.y = math.floor(y)
    editor_pet_cache.pet_id = pet.id
    editor_pet_cache.visible = true

    renderer.draw_canvas(
      frame,
      editor_pet_cache.x,
      editor_pet_cache.y
    )
  end
end

-- Single overlay hook for both the stage and Editor Pet. Do not reassign this
-- method from commands or settings callbacks.
function RootView:draw()
  parent_draw(self)
  if not settings.enabled or #pets == 0 then return end

  local now = system.get_time()
  local stage_x, floor_y = get_stage_geometry()
  local x = stage_x

  for _, pet in ipairs(pets) do
    pet.stage_hit_visible = false
  end

  for _, pet in ipairs(pets) do
    if is_pet_enabled(pet) then
      local frame = pet.frames[pet.current_frame]
      local normal_y = floor_y - pet.height + motion_offset(pet, now)
      local falling_y = crazy_y(pet, now)
      local y = falling_y or normal_y

      if frame then
        pet.stage_hit_x = math.floor(x)
        pet.stage_hit_y = math.floor(y)
        pet.stage_hit_visible = true

        renderer.draw_canvas(
          frame,
          pet.stage_hit_x,
          pet.stage_hit_y
        )
      end

      draw_pet_message(pet, x, y)
      x = x + pet.width + settings.gap
    end
  end

  draw_editor_pet()
end


-----------------------------------------------------------------------
-- MOUSE INTERACTION
--
-- RootView:draw() is still wrapped exactly once.
-----------------------------------------------------------------------

local parent_on_mouse_pressed =
  RootView.on_mouse_pressed

local function point_inside(x, y, px, py, width, height)
  return
    x >= px and
    x < px + width and
    y >= py and
    y < py + height
end

local function manual_react_pet(pet)
  if not pet then return false end

  local text =
    raw_pet_setting(pet, "manual_message") or ""

  request_action(
    pet,
    make_special_action(
      pet,
      "manual",
      text,
      "normal"
    ),
    system.get_time(),
    true
  )

  core.redraw = true
  return true
end

-- Hit-test our cached sprite rectangles first; delegate every unhandled click
-- to Pragtical's original RootView handler so editor input remains untouched.
function RootView:on_mouse_pressed(button, x, y, clicks)
  local primary_button =
    button == "left" or
    button == 1

  if settings.enabled and primary_button then
    if
      editor_pet_cache.visible and
      point_inside(
        x,
        y,
        editor_pet_cache.x,
        editor_pet_cache.y,
        editor_pet_cache.width,
        editor_pet_cache.height
      )
    then
      local pet =
        find_pet_by_id(editor_pet_cache.pet_id)

      if manual_react_pet(pet) then
        return true
      end
    end

    for index = #pets, 1, -1 do
      local pet = pets[index]

      if
        pet.stage_hit_visible and
        point_inside(
          x,
          y,
          pet.stage_hit_x,
          pet.stage_hit_y,
          pet.width,
          pet.height
        )
      then
        if manual_react_pet(pet) then
          return true
        end
      end
    end
  end

  return parent_on_mouse_pressed(
    self,
    button,
    x,
    y,
    clicks
  )
end

-----------------------------------------------------------------------
-- COMMANDS -- THESE NEVER REINSTALL ANY HOOK
-----------------------------------------------------------------------

local function selected_pet()
  for _, pet in ipairs(pets) do
    if pet.id == settings.selected_character and is_pet_enabled(pet) then
      return pet
    end
  end
  return nil
end

command.add(nil, {
  ["touhou-fumo:toggle"] = function()
    settings.enabled = not settings.enabled
    core.redraw = true
  end,

  ["touhou-fumo:react"] = function()
    local pet = selected_pet()
    if not pet then return end
    local text = raw_pet_setting(pet, "manual_message") or ""
    request_action(
      pet,
      make_special_action(pet, "manual", text, "normal"),
      system.get_time(),
      true
    )
  end,

  ["touhou-fumo:spin"] = function()
    local pet = selected_pet()
    if not pet or #pet.spin_frames == 0 then return end
    request_action(
      pet,
      make_spin_action(pet, "manual", "", "normal"),
      system.get_time(),
      true
    )
  end,

  ["touhou-fumo:crazy-spin"] = function()
    local pet = selected_pet()
    if not pet or #pet.spin_frames == 0 then return end
    request_action(
      pet,
      make_crazy_spin_action(pet, "manual", "", "normal"),
      system.get_time(),
      true
    )
  end,

  ["touhou-fumo:custom-reaction-1"] = function()
    dispatch_trigger("custom1", "", true)
  end,
  ["touhou-fumo:custom-reaction-2"] = function()
    dispatch_trigger("custom2", "", true)
  end,
  ["touhou-fumo:custom-reaction-3"] = function()
    dispatch_trigger("custom3", "", true)
  end,
  ["touhou-fumo:custom-reaction-4"] = function()
    dispatch_trigger("custom4", "", true)
  end
})

core.log(
  "Touhou Fumo loaded with %d character definition(s)",
  #pets
)
