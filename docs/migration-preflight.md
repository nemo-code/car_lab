# SQLite → PocketBase 迁移预检

预检本身只读源 SQLite，不导入、不改旧库、不更改线上代理或部署。预检通过只说明源数据满足已实现的数据检查；`readyForImport` 始终为 `false`，目标权限与密码迁移仍须单独验证。通过预检后，已实现的 `scripts/migration-import.mjs` 才能在固定版本、隔离并获授权的 PocketBase 目标上执行写入。

## 使用

运行环境与现有服务相同，需要支持 `node:sqlite` 的 Node.js。对已批准的脱敏测试副本运行：

```sh
node scripts/migration-preflight.mjs /absolute/path/to/approved-sqlite-copy
node --test scripts/migration-preflight.test.mjs

# 在预检通过后生成不写入目标库的确定性映射计划
node scripts/migration-plan.mjs /absolute/path/to/approved-sqlite-copy
```

以上源路径是显式占位值，使用时替换为真实测试副本。工具以 SQLite 只读模式及 `query_only` 打开数据库，在同一个读事务中统计。它不导入会修改数据库结构的 `server/platform.js`，不创建不存在的数据库，不接受目标服务凭据，不发起网络请求。

该导入器只接受重构前的旧 SQLite 模型：`users.team` 是每个用户唯一的团队，申请团队由用户主团队推导，资源正文位于 `resources.body`。若来源包含新版的 `teams`、`team_memberships`、`resource_contents`、`projects`、`project_assets`、`announcements`、`site_pages`、`audit_logs` 表，或 `users.is_active`、`applications.team`、`resources.status` 字段，预检会阻断导入，避免遗漏多团队关系、附件、资源状态或其他新数据。预检通过表示来源符合旧模型，不代表具备导入新版 Node SQLite 数据库的能力。

报告包含必需字段、用户/团队/状态分布、资源与申请数量、非法学号、重复学号、大小写及空白正规化后的重复用户名与邮箱、PocketBase 不接受的用户名、缺失团队、孤立申请、申请状态不一致、非法角色与资源可见范围。用户名校验与 PocketBase/Auth Hooks 一致：先去空白并转为小写，再接受 3–30 位、以 ASCII 小写字母开头且后续可包含字母、数字、`_`、`.`、`-`。空用户名及不可导入的无效邮箱不参与重复检查；历史管理员可没有学号，但必须至少保留一个可用的邮箱、学号或用户名登录身份。旧邮箱账号仍需人工确定补充学号或账户恢复方案。

退出码：`0` 表示源数据检查通过，`1` 表示存在数据问题或字段缺失，`2` 表示调用或读取失败。报告不输出姓名、学号、邮箱、用户名、申请说明、正文、密码哈希或 Session，仅输出计数和基于旧记录 ID 生成的摘要引用。摘要引用仍可跨报告关联，应保存在受控位置，不提交真实数据报告。资源摘要需要人工确认允许公开，预检不能自动判断正文或摘要的语义隐私。

## 迁移映射与后续门禁

| 旧数据 | 目标 | 核对方式 |
| --- | --- | --- |
| `users.id` | `users.legacy_user_id` 与外部 `legacy_id → target_id` 映射文件 | 旧 ID 仅用于受控对账，不作为登录身份；唯一映射，重跑不重复 |
| `users.student_id/username/name/grade/status/role` | `users` 对应字段 | 学号、用户名唯一；角色和状态分布一致 |
| `users.team` | `users.primary_team` → `teams` 与 `team_memberships` | 三团队 code 映射；每个旧用户生成一条兼容 membership，不能产生孤立关联 |
| `applications.user_id` | `applications.user` | 使用用户映射；团队从旧用户关联恢复 |
| `resources` 目录字段 | `resources` | 目录数量与可见范围一致 |
| `resources.body` | `resource_contents.body` | 私有正文与公开目录拆分；逐团队越权检查 |
| 旧密码哈希和 Session | 不直接导入 | 核验身份后安全重置；旧 Session 不延续 |

预检命令本身不写入目标，也不生成映射文件。需要持久化脱敏 `legacy_id → target_id` 映射时，使用 `scripts/migration-import.mjs --mapping-file <path>`；该文件只包含摘要、计数和 opaque ID，不包含密码、学号、身份、申请说明或正文。正式导入器会在隔离目标上幂等写入，但不得凭源预检结果或单次导入报告宣称生产迁移完成。

导入前必须验证注册→审批→同团队 Protected 文件下载的闭环、跨团队拒绝、停用失效；验证备份可恢复；在隔离目标运行迁移两次并核对数量、状态、关联和正文隐私。可使用 `npm run verify:pocketbase-migration` 重跑脱敏真实目标验证；它会创建临时 SQLite/PocketBase、核对三团队、用户/申请/资源/正文关联、映射文件、幂等第二次导入和源库字节不变。正式数据仍需至少抽样管理员、三团队及 pending/approved/rejected。所有敏感文件留在 PocketBase 私有持久化目录，不能进入 `public/` 或 `dist/`。

正式切换需另行授权。保持旧代码版本、SQLite 完整备份（包括使用中的 WAL 一致性处理）和媒体素材；保存旧 Nginx 与 systemd 配置。回滚时先停止新入口写入，依据已验证的恢复流程恢复旧代码、旧数据库与原代理路由，并核验登录和资源权限。未实际演练前，回滚能力仍为待验证。
