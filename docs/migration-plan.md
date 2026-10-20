# SQLite → PocketBase 确定性迁移计划

`migration-plan.mjs` 是 SQLite 预检之后的只读门禁。正式写入由 `scripts/migration-import.mjs` 单独负责，只有在 PocketBase 0.40.5 隔离实例、集合规则和回滚演练通过后才允许在明确授权的目标上运行。

## 用法

```sh
node scripts/migration-plan.mjs /absolute/path/to/approved-sqlite-copy
node scripts/migration-import.mjs /absolute/path/to/approved-sqlite-copy
node --test scripts/migration-plan.test.mjs
node --test scripts/migration-import.test.mjs
```

计划建立在 `migration-preflight.mjs` 的只读检查之上。源数据检查未通过时，计划会停止在预检门禁，不读取后续投影，也不生成可执行导入操作；这样可以避免把有歧义的数据带入目标库。

## 输出边界

输出只包含：

- 集合记录数量、确定性映射对和映射摘要。旧记录 ID 会先经过哈希，目标 ID 使用固定版本的哈希并截取为 PocketBase 允许的 15 个字符，因此同一份源库重复运行结果一致。
- 应用→用户、应用→团队、资源→团队、资源正文→资源目录的关系解析数量和缺失数量。
- 公开/团队资源及有正文资源的数量。
- 目标版本、写入次数和敏感字段处理策略。

计划不会输出姓名、学号、用户名、邮箱、申请说明、资源正文、密码哈希、Session、文件内容或原始 SQLite 路径。密码哈希和旧 Session 永不直接导入；密码必须采用经过授权的重置流程，Session 必须全部失效。资源正文只能在 Protected 文件和正文访问规则通过隔离负向测试后，由单独的导入器处理。

## 通过条件

计划通过只表示源数据检查、确定性 ID 映射和关系计数没有发现问题，不代表迁移完成。macOS arm64 的隔离 PocketBase 0.40.5 实例已完成规则与 Protected 文件验证；正式导入前仍需在目标部署平台重复验证：重复运行不新增记录；管理员、三团队及 pending/approved/rejected 状态均可抽样；同团队 Protected 文件可读、跨团队拒绝、停用立即失效；备份可以恢复。正式切换和任何生产写入需要另行授权。
