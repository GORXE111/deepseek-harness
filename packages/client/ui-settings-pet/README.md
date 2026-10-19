# @deepseek-ai/dsh-client-ui-settings-pet

English | [中文](README.zh.md)

## Summary

DeepSeek Client's desktop companion settings. A row in **Settings → General** chooses who sits on the desktop (MIKU or 庄方宜) and what she calls the user. The Host half holds the preferences as the live config of the `pet` entry, provides them to the Desktop companion bridge, and announces changes in place.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

The `web-app` bundle mounts this package as the `pet` entry in the Desktop profile only, next to the `preset-pet` (MIKU) and `preset-pet-zhuang` (庄方宜) agent presets the companions speak with. The row writes `character` when a companion is chosen and `nickname` (trimmed, at most 16 characters) on blur or Enter; an empty nickname means the companion addresses nobody.

The entry id is also the settings namespace, `pet`, which is the section name the 0.1 build kept in `settings.yaml`; the one-time legacy settings import moves that section into this entry. The section's `voice*` fields keep validating but have no settings row: spoken alerts remain an extension point enabled by editing the settings document.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

Every field is volatile, so a settings write updates the entry in place without restarting it. The entry provides the `petSettings` service, whose `get()` returns a copy of the current preferences, and on each `loader/volatile-update` emits `pet/settings-changed` on the root context with the new preferences; the Desktop bridge forwards that to the companion window, so a companion switch shows at once. The browser half mirrors the `pet` config form into a row store registered in `settings.general.item` at order 12, after Appearance.

-----

<a id="model-experience"></a>
## Model Experience

The settings themselves add no model-visible text. The companion presets carry their persona as the complete system prompt, with no tools; the Desktop bridge prefixes the nickname to the first message of a companion session after the nickname changes.

#### KV Cache effect

A nickname change adds one line to the next companion message only; the presets' system prompts are static.

-----

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The companion list is fixed in this package and in the Desktop shell; adding a companion changes both.
- The `voice*` fields have no settings row.
