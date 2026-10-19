# @deepseek-ai/dsh-client-ui-settings-pet

[English](README.md) | 中文

## 概述

DeepSeek Client 的桌面陪伴助手设置。**设置 → 通用**中的一行用来选择由谁陪在桌面上（MIKU 或庄方宜），以及她怎么称呼用户。宿主侧把这些偏好保存为 `pet` 条目的实时配置，提供给 Desktop 陪伴助手桥接，并在原地变化时发出通知。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

`web-app` 组合包只在 Desktop profile 中把本包挂载为 `pet` 条目，旁边是两位陪伴助手所用的 `preset-pet`（MIKU）与 `preset-pet-zhuang`（庄方宜）智能体预设。选择陪伴助手时，该行写入 `character`；昵称（去除首尾空白，最多 16 个字符）在失焦或按回车时写入 `nickname`；昵称为空表示陪伴助手不称呼任何人。

条目 id 同时也是设置命名空间 `pet`，即 0.1 版本在 `settings.yaml` 中使用的分节名；一次性的旧设置导入会把该分节移入本条目。该分节的 `voice*` 字段仍会校验，但没有设置行：语音提醒仍是一个通过编辑设置文档启用的扩展点。

-----

<a id="understand-the-implementation"></a>
## 理解实现

所有字段都是 volatile 的，因此设置写入会原地更新条目而不重启它。条目提供 `petSettings` 服务，其 `get()` 返回当前偏好的副本；每次 `loader/volatile-update` 时，它在根上下文上发出带有新偏好的 `pet/settings-changed`，Desktop 桥接把该事件转发给陪伴助手窗口，因此切换陪伴助手会立刻生效。浏览器侧把 `pet` 配置表单镜像到一个注册在 `settings.general.item`、顺序为 12（在外观之后）的设置行 store。

-----

<a id="model-experience"></a>
## 模型体验

设置本身不添加任何模型可见文本。陪伴助手预设把人设作为完整的系统提示词，且没有任何工具；昵称变化后，Desktop 桥接会把昵称加在陪伴助手会话的下一条首条消息之前。

#### KV 缓存影响

昵称变化只会给下一条陪伴助手消息增加一行；预设的系统提示词是静态的。

-----

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 陪伴助手列表固定在本包与 Desktop 壳中；新增一位陪伴助手需要同时修改两处。
- `voice*` 字段没有设置行。
