# Agent usage / Agent 使用说明

Read `AGENTS.md` and `THIRD_PARTY_NOTICES.md`. Canonical source is `src/`; editions
are generated from `profiles/`. Do not mirror the live desktop into this repository.

这是一个源码整合项目：一个 Shell 入口、一个 DockManager、内部主题/桌面模块，
中文版额外集成原生输入面板及 Fcitx5/Rime 实际运行组件。不要恢复为多个扩展的控制器。
共享不可变资源只保留一份，个人配置与学习词库另行保存。

构建：`python3 scripts/build.py`。如需更新官方输入法运行组件，先审查并运行
`scripts/vendor_input_runtime.py`，保留校验清单、对应源码与所有版权文件。
构建本身离线；只有该显式更新脚本访问 Ubuntu 官方归档。

安装器默认只安装资源。`--apply` 应用设置；英文版同时按用户要求设置当前用户会话英语。
必须支持备份、失败回滚与恢复，不能覆盖完整的 GNOME 扩展启用列表。
需要源码变更时不要操作当前桌面主题、输入法、HDR 或退出会话来验证。

Validation commands are in `docs/VALIDATION.md`. All integration checks use temporary
homes and private buses. A second launcher must reuse an existing engine, and cleanup
must only terminate a process actually started by that launcher. Never use `--replace`
or kill an unrelated IME process.
