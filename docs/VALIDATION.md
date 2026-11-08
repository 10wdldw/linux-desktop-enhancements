# 3.1.2 发布验证（2026-11-08）

发布代码与当前安装版本对照，合入热点/快捷设置和输入面板的本机修补；
硬盘图标的卷标识改为读取本机配置，发布源码不内置个人卷标识。

- 32 项安装器测试通过，覆盖备份、回滚、输入保留、语言恢复及登录激活。
- 共享资源与中英本地化测试通过。
- 中英文版在临时 HOME、私有 D-Bus/keyfile 和 headless GNOME 50 中 ACTIVE；
  各自三次启停、主题切换、真实 GTK 窗口圆角/最大化/最小化、首选项通过。
- 同批 20 次图标查询合并为一次枚举；中文 40 次焦点请求合并为一次快照，
  20 次相同候选更新没有重建。停用后托管连接和任务归零。
- 中文内嵌引擎实际输入 `nihao ` 提交“你好”，GTK 3/4 前端加载、进程复用、退出回收通过。
- 两版从已实际加载的旧 Dock/MacStyle/Kimpanel/User Themes 迁移，经两个隔离 Shell
  模拟重新登录：旧会话保持待激活，新会话自动激活、两次运行检查及一次性任务清理通过。
- 新增硬盘配置检查：缺失/合法/损坏配置、缺失图标和路径越界输入；无效映射不会阻止 Dock 启用。

本版标记为预发布。未执行真实关机、重启、注销、热点联网或 HDR 切换；
没有验证真实硬盘热插拔、高刷/多屏流畅度以及 Dock 红点和通知胶囊的全部反馈。
这些检查不构成 FPS 基准，也不代表先前所有实机问题已经解决。

```bash
gjs -m tests/drive-config.js
```

其余复现命令见下文。历史结果保留原版本与日期。

# 3.1.1 迁移回归（2026-10-29）

Ubuntu / GNOME Shell 50.1。测试使用临时 HOME、私有 D-Bus、keyfile 设置后端和 headless Wayland。

- 32 项安装器/登录恢复测试：包含现有输入配置保留、缓存 ERROR 延迟激活、瞬时导入状态、详细错误、失败恢复和过期任务取消。
- 共享资源与中英本地化检查通过。
- 实际旧 Ubuntu Dock、MacStyle、Kimpanel、User Themes 复制到临时目录，先全部 ACTIVE，然后分别切换中英文版；两版成功。
- 两个隔离 Shell 进程模拟重新登录：旧会话提前触发返回等待，新会话自动激活并通过两次运行检查，自动启动项清除；两版验证。
- 两版均继续验证 Dock 放大、主题、真实 GTK 窗口圆角/最大化/最小化及三次启停；中文候选去重、焦点合并与 GTK3/4 前端通过。
- 内嵌 Fcitx5/Rime 实际输入 nihao 提交“你好”，包内库加载、重复启动复用和退出回收通过。

迁移测试调用示例（路径由测试者提供，只读取源树，复制到临时环境）：

```bash
python3 tests/validate_runtime.py zh en --legacy-dir /path/to/legacy-dock --legacy-dir /path/to/legacy-desktop
python3 tests/validate_runtime.py zh en --login-retry --legacy-dir /path/to/legacy-dock --legacy-dir /path/to/legacy-desktop
```

英文测试包显式关闭宿主账户语言修改；不自动注销真实会话，不触发电源/HDR 操作。
上述结果是隔离验证，实际桌面仍需重登后观察。以下为 3.1.0 原核验记录和其他复现命令。

# Validation / 核验记录

日期：2026-10-26。版本：3.1.0。环境：Ubuntu 26.04.1 amd64，GNOME Shell 50.1。

## 结果

- 23 项安装器测试通过：冲突、文件/链接恢复、失败回滚、语言恢复、旧扩展状态、中英文分层替换、修改文件保留和中英文载荷边界。英文版激活保留已有输入面板。
- 共享资源回归通过：独立订阅、异常隔离、自我取消/抛错任务回收、单项清理失败、keyed idle、共享状态合并、帧内缓存、相同候选去重。
- 中英文均在临时 HOME、私有 D-Bus、keyfile 后端及 headless Wayland 中 ACTIVE。只启用一个 linux-beautify@local，连续三次禁用/启用后仍 ACTIVE，托管资源数量稳定。
- 每版一个 Dock、一个外观 Settings 对象、一条外观变化连接。新网络客户端、Dock 发现轮询和整棵 Shell 输入扫描均为零。英文版输入模块与焦点监听为零。
- 实际 Shell 中，同一批 20 次图标查询只枚举一次，放大目标正常，批次结束缓存清空。
- 真实 GTK 窗口圆角、最大化/还原、最小化/还原通过，没有额外阴影 actor；深浅主题切换通过，仍只有一条外观监听；首选项启动无插件错误。
- 中文版 40 次焦点刷新请求合并为一次读取；20 次相同候选更新不重建；位置变化不重建；选中项变化仍更新。离开焦点后候选服务名和信号订阅释放。
- 包内 GTK 3/4 输入模块与 GClient 实际加载通过。真实内嵌引擎输入 nihao 加空格提交“你好”；进程映射确认使用包内 Fcitx5/Rime/Lua，重复启动复用，停止后服务名释放。
- 禁用后共享连接、托管 timer/idle、待处理网络请求均为零，DockManager 单例释放；原生输入引擎退出及重启通过。英中本地化、JS 解析、Python 编译、严格 schema 与空白检查通过。

审计发现见 [AUDIT.md](AUDIT.md)。未测量整机性能提升百分比。

## 复现

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
node tests/resources.mjs
node tests/localization.mjs
python3 tests/validate_runtime.py en zh
python3 tests/validate_embedded_input.py
python3 scripts/build.py
cd dist && sha256sum -c SHA256SUMS
```

构建离线使用仓库内固定源码与组件，需要 Python 3、glib-compile-schemas、sassc、msgfmt。
运行验证另需 GNOME 50、GJS、GTK 3/4、libadwaita、PyGObject、D-Bus 和图形基础库。
本次未调用显式联网的 vendor_input_runtime.py，也没有修改系统软件包。

## 范围

未安装到活动桌面，没有自动注销。真实高刷/HDR 效果、拖动手感、跨显示器、全部应用兼容
和 Qt/Flatpak 前端未逐一实测。未执行真实电源操作、热点联网或 HDR 标志切换。
“20 次查询/40 次请求”是功能计数工作负载，不是 FPS 或 CPU 基准。
