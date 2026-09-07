# 步步出沪版本交付说明

## 1. 本次交付

- 交付日期：2026-09-07
- 小程序展示版本：`v1.3.2`
- 完整项目远程仓库：`https://github.com/lichengding0813/bubuchuhu.git`
- 完整项目基线分支：`codex/v1.3-weather-fix`
- 代码基线提交：`7f0b895` (`feat: replace weather emoji with custom icons`)
- 前端本地基准：`/Users/dinglicheng/miniprogram`
- 统一交付目录：`/Users/dinglicheng/bubuchuhu`

> GitHub 的默认分支当前指向 `backend`，该分支不是完整项目交付分支。获取整个项目时，必须明确使用 `codex/v1.3-weather-fix`，不能只克隆默认分支。

### 交付内容

| 目录 | 内容 | 版本来源 |
|---|---|---|
| `miniprogram/` | 微信小程序前端 | 远程基线 + 本地前端差异 |
| `backend/` | Flask 后端、Dockerfile、测试和迁移脚本 | 远程基线 |
| `database/` | 建表语句及增量迁移 | 远程基线 |
| `local-deploy/` | 当前后端代码 + 本地私有部署配置 | 仅存在于本机，不进入 Git |

`node_modules/`、`miniprogram_npm/`、Python 缓存、上传文件和历史压缩包不属于源代码，本次不复制到 Git 交付层。

### 本地保留改动

2026-09-07 交付时，`/Users/dinglicheng/miniprogram` 相对远程基线有两处用户手动改动，已合并到交付目录：

1. `miniprogram/pages/profile/profile.wxml`：页面版本号由 `v1.3` 改为 `v1.3.2`。
2. `miniprogram/pages/update-log/update-log.js`：保留本地 `1.3.0`、`1.3.1`、`1.3.2` 更新记录。

因此，交付目录中这两个文件会在 `git status` 中显示为未提交差异。它们是主动保留的本地最新内容，不是同步错误。

## 2. 远程仓库提交规则

### 分支与推送

1. 开发前先确认分支和上游：`git branch -vv`。
2. 完整项目以 `codex/v1.3-weather-fix` 为当前交付基线；`backend` 仅用于后端安全版，不作为完整项目基线。
3. 每个需求使用独立分支或已确认的交付分支，不在未确认的情况下直接改远程主分支。
4. 推送时明确指定分支：`git push origin <branch>`。
5. 不使用强制推送，不重写已经推送的历史，除非为凭证泄漏处理且已明确确认。

### 提交范围

1. 提交前执行 `git status --short` 和 `git diff --check`。
2. 只用 `git add <具体路径>` 添加当前需求相关文件，避免把本地配置或其他未完成改动一起提交。
3. 一次提交只表达一类完整改动，并保持可单独回退。
4. 提交信息使用简单类型前缀：
   - `feat:` 新功能
   - `fix:` 问题修复
   - `style:` 样式调整
   - `docs:` 文档
   - `chore:` 构建、依赖或维护任务

### 提交前验证

1. JavaScript 文件至少通过 `node --check`。
2. Python 文件至少通过 `python -m compileall`，后端功能改动还需执行相关测试。
3. 前端修改后用微信开发者工具重新编译，至少检查开发者工具和一台真机。
4. 数据库改动必须同时保存迁移脚本，不只修改建表文件。
5. 推送前检查差异中是否包含 AppID、Secret、数据库密码、天气 API Key、Token 或个人信息。

### 凭证管理

1. 远程仓库只保存安全版，凭证由云托管 Secret/环境变量注入。
2. `.env`、包含凭证的 Dockerfile、部署压缩包和 `project.private.config.json` 不允许提交。
3. 本机私有版放在 `local-deploy/`，并写入该工作区的 `.git/info/exclude`。
4. 一旦凭证出现在公开提交中，应先在对应平台轮换凭证，再处理 Git 历史和安全告警。

## 3. 本地前端快照规则

### 快照位置与命名

- 根目录：`/Users/dinglicheng/Documents/Codex/2026-08-03/yue/local-snapshots/`
- 目录名：`YYYYMMDD-HHMMSS-需求简称`
- 示例：`20260907-092236-weather-icons`
- 快照内保留目标文件在 `miniprogram/` 中的相对目录结构，便于逐文件回退和对比。

### 创建时机

修改或同步 `/Users/dinglicheng/miniprogram` 前，必须先：

1. 列出当前需求将要修改的目标文件。
2. 逐文件对比本地前端与仓库版本。
3. 把本地目标文件复制到新的时间戳快照目录。
4. 确认快照可读后才开始修改。

### 合并原则

1. `/Users/dinglicheng/miniprogram` 是前端本地基准，用户可能直接修改其中代码和资源。
2. 本地文件与仓库不同时，必须以本地内容为基础做局部合并。
3. 只修改当前需求涉及的最小代码范围，保留其他本地改动。
4. 同步代码使用可审核的局部补丁；不使用 `cp`、`rsync` 或目录镜像直接覆盖整个前端。
5. 同步前再次确认本地目标文件没有在快照后被继续修改。

### 同步后验证

1. 逐文件比较已同步内容。
2. 重新执行语法、格式和需求相关测试。
3. 再做一次整体前端差异检查。
4. 交付时明确列出：已修改文件、已保留的用户改动、仍存在的仓库/本地差异。

### 回退

如果同步后出现问题，先停止继续修改，用最近一次需求快照与当前文件生成反向差异，仅回退本次修改。不使用 `git reset --hard` 或整目录覆盖。

## 4. 交付目录更新流程

1. 从完整项目分支更新 Git 基线。
2. 对比交付目录与 `/Users/dinglicheng/miniprogram`。
3. 对本地前端差异建立快照并做局部合并。
4. 用当前 `backend/` 刷新 `local-deploy/` 中的程序代码，但保留本地私有 Dockerfile 和 `.env`。
5. 检查 `git status`，确认私有部署目录没有进入待提交列表。
6. 完成语法检查、单元测试、前端编译和真机验收后再发布。

## 5. 当前部署注意事项

- 生产凭证不存在于远程代码中。
- 私有 Dockerfile 当前保留数据库和微信配置；天气 `WEATHER_API_KEY` 仍需由云托管环境变量或 Secret 注入。
- 后端部署前应核对 `.env.example` 中的所有变量名，不应依赖代码中的默认凭证。
- 订阅消息定时任务依赖持续运行实例，生产环境至少保留 1 个运行实例。
