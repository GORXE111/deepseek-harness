# @deepseek-ai/dsh-client-ui-settings-mcp

English | [中文](README.zh.md)

## Summary

DeepSeek Client's MCP server manager. Users add, remove, enable, and edit MCP servers in **Settings → Plugins → MCP servers**; the Host half mounts one [`dsh-mcp-client`](../../mcp/mcp-client/README.md) per enabled, complete entry. Edits apply without a restart, and only the servers an edit changes reconnect.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

The `web-app` bundle mounts this package as the `mcp-servers` entry. Its live `servers` config is the list the settings tab edits; each entry has `name`, `enabled`, `transport` (`stdio` or `streamable-http`), the stdio `command`, `args`, and `env`, and the HTTP `url` and `headers`. The tab edits everything except `env` and `headers`, which stay editable in the profile's settings document.

An entry mounts when it is enabled, its name is 1–32 letters, digits, underscores, or hyphens, and its transport has a command or URL. A half-written entry stays in the list unmounted. When two entries share a name, only the first mounts and the tab flags the others. The tab writes switches, the transport menu, add, and remove at once; text fields write on blur or Enter.

The entry id is also the settings namespace, `mcp-servers`, which is the section name the 0.1 build kept in `settings.yaml`; the one-time legacy settings import moves that section into this entry.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

`servers` is a volatile config field. A settings write updates it in place without restarting the entry, and the Loader's `loader/volatile-update` event triggers a diff: each mountable entry is translated into an MCP client config, and a server is unmounted and remounted only when its translated config changed. Servers whose config is unchanged keep their connection and tool generation. Mounted clients are child plugins of the manager, so disposing the manager unmounts them all. The browser half mirrors the `mcp-servers` config form into a tab store registered in the `settings.plugins.tab` slot.

-----

<a id="model-experience"></a>
## Model Experience

This package adds no model-visible text itself. Each mounted server contributes the tools, resources, and instructions documented in [`dsh-mcp-client`](../../mcp/mcp-client/README.md), named `mcp__<name>__<tool>`; the server name is therefore model-visible, and renaming a server reads as removing one server and adding another.

#### KV Cache effect

Mounting, unmounting, or editing a server changes the tool list and may change the system prompt, which invalidates the cached prefix from that point on.

-----

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- `env` and `headers` have no editor in the tab; they are edited in the settings document.
- A server's connection state and errors are not shown in the tab; a server that fails to start leaves its row unchanged.
