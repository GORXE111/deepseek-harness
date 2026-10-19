# @deepseek-ai/dsh-client-ui-settings-mcp

[English](README.md) | 中文

## 概述

DeepSeek Client 的 MCP 服务器管理器。用户在**设置 → 插件 → MCP 服务器**中添加、删除、启停和编辑 MCP 服务器；宿主侧为每个启用且完整的条目挂载一个 [`dsh-mcp-client`](../../mcp/mcp-client/README.zh.md)。修改无需重启即可生效，只有被修改的服务器会重新连接。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

`web-app` 组合包把本包挂载为 `mcp-servers` 条目。它的实时 `servers` 配置就是设置页编辑的列表；每个条目包含 `name`、`enabled`、`transport`（`stdio` 或 `streamable-http`），stdio 的 `command`、`args` 与 `env`，以及 HTTP 的 `url` 与 `headers`。设置页可以编辑除 `env` 与 `headers` 以外的全部字段，这两项仍在 profile 的设置文档中编辑。

条目在以下条件下挂载：已启用，名称为 1–32 个字母、数字、下划线或连字符，且其连接方式填写了命令或地址。写到一半的条目留在列表中但不挂载。两个条目同名时，只有第一个挂载，设置页会标出其余条目。设置页对开关、连接方式菜单、添加与删除即时写入；文本框在失焦或按回车时写入。

条目 id 同时也是设置命名空间 `mcp-servers`，即 0.1 版本在 `settings.yaml` 中使用的分节名；一次性的旧设置导入会把该分节移入本条目。

-----

<a id="understand-the-implementation"></a>
## 理解实现

`servers` 是 volatile 配置字段。设置写入会原地更新它而不重启条目，Loader 的 `loader/volatile-update` 事件随后触发一次比对：每个可挂载条目被转换为 MCP 客户端配置，只有转换后配置发生变化的服务器才会被卸载并重新挂载。配置未变的服务器保留其连接与工具代数。已挂载的客户端是管理器的子插件，因此销毁管理器会卸载全部客户端。浏览器侧把 `mcp-servers` 配置表单镜像到一个注册在 `settings.plugins.tab` 插槽中的标签页 store。

-----

<a id="model-experience"></a>
## 模型体验

本包自身不添加任何模型可见文本。每个已挂载的服务器提供 [`dsh-mcp-client`](../../mcp/mcp-client/README.zh.md) 所述的工具、资源与说明，工具名为 `mcp__<名称>__<工具>`；因此服务器名称对模型可见，改名相当于移除一个服务器再添加另一个。

#### KV 缓存影响

挂载、卸载或编辑服务器会改变工具列表，也可能改变系统提示词，从而使该位置之后的缓存前缀失效。

-----

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 设置页没有 `env` 与 `headers` 的编辑器；它们在设置文档中编辑。
- 设置页不显示服务器的连接状态与错误；启动失败的服务器其行保持不变。
