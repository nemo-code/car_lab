# SQLite → PocketBase 导入器

`scripts/migration-import.mjs` 是在预检和隔离权限验证通过后运行的正式写入器。它只读打开旧 SQLite，不会写回源库；目标写入使用经过授权的 PocketBase 超级管理员 Token，不能把该 Token 放进前端或提交到仓库。

默认模式只生成脱敏报告：

```sh
npm run migration:import -- /absolute/path/to/approved-sqlite-copy
```

默认不会创建映射文件。需要保留 `legacy_id → target_id` 对账表时，必须显式指定输出路径：

```sh
npm run migration:import -- \
  /absolute/path/to/approved-sqlite-copy \
  --mapping-file /absolute/path/to/controlled/migration-mapping.json
```

映射文件也可以和正式写入一起生成。脚本先核对目标实例并将映射文件原子写入受控路径，再开始写入业务记录；如果映射路径无效或不可写，目标保持不变：

```sh
POCKETBASE_URL=http://127.0.0.1:18082 \
POCKETBASE_ADMIN_TOKEN='<短期超级管理员 token>' \
npm run migration:import -- \
  /absolute/path/to/approved-sqlite-copy \
  --apply \
  --mapping-file /absolute/path/to/controlled/migration-mapping.json
```

映射文件的目录必须预先存在；脚本不会因为映射参数自动创建任意目录。写入采用临时文件原子替换并设置为仅当前用户可读写（`0600`），目标不能是源 SQLite 文件、目录或符号链接。重复运行会以同一确定性内容替换该文件。

dry-run 中团队的 `target_id` 是确定性计划值；使用 `--apply` 时，脚本会在业务写入前从目标实例按 `code` 读取真实团队 ID，并将该映射先保存到受控文件。用户、申请、资源和正文记录的目标 ID 始终由源 ID 确定性推导；导入用户同时写入唯一的 `users.legacy_user_id`，只用于目标记录与源记录的受控对账。

文件结构只包含版本、目标版本、源数据摘要哈希、计数，以及各集合的 `legacy_id` 和 `target_id`：

```json
{
  "formatVersion": 1,
  "type": "legacy-to-pocketbase-id-mapping",
  "sourceDigest": { "users": "…", "applications": "…", "resources": "…" },
  "targetIdSource": "target-records-for-teams-deterministic-for-imported-records",
  "collections": {
    "users": {
      "records": 2,
      "mappingDigest": "…",
      "pairs": [{ "legacy_id": "…", "target_id": "…" }]
    }
  }
}
```

该文件用于受控的源/目标关联核对，应和迁移报告、备份放在同一受限目录，不应提交到仓库或公开分发。脚本不会把密码哈希、随机初始密码、Token、Session、姓名、学号、邮箱、申请说明、资源正文或完整源路径写入映射文件；命令标准输出仍只包含脱敏报告。映射文件中的旧记录 ID 仅用于迁移对账，仍应按敏感运维产物处理。

写入前先确认目标是全新的隔离 PocketBase 数据目录，并通过固定版本和备份门禁。确认后才使用：

```sh
POCKETBASE_URL=http://127.0.0.1:18082 \
POCKETBASE_ADMIN_TOKEN='<短期超级管理员 token>' \
npm run migration:import -- /absolute/path/to/approved-sqlite-copy --apply
```

`--apply` 会在请求前执行目标保护：只接受 loopback URL；要求 PocketBase 健康接口可用、目标只有三个配置团队；并要求 `users`、`team_memberships`、`applications`、`resources` 和 `resource_contents` 中不存在本次源库映射之外的记录。若集合已有本次映射中的 ID，每个将由导入器管理的字段也必须与源数据投影完全一致；任何同 ID 冲突都会在写入前拒绝，避免覆盖无关记录。检查失败不会开始业务写入。使用 `--mapping-file` 时，映射文件在业务写入前持久化；映射写入失败同样不会开始业务写入。PocketBase API 不提供可供该导入器证明服务端二进制版本的可信凭据，因此操作者仍须在隔离实例主机上核对 `pocketbase --version` 和官方包 SHA-256；本地目标检查不能替代该版本门禁。

导入器使用稳定的源记录 ID 哈希生成不超过 15 个字符的 PocketBase ID。重复运行会读取同一目标 ID 并更新或保持不变，不会创建重复用户、申请、资源或正文记录。导入报告只输出计数、摘要哈希和每个集合的创建/更新/不变数量，不输出姓名、学号、申请说明、正文、旧密码哈希、Session、Token 或完整源路径。

旧密码哈希和 Session 永不迁移。新用户会获得随机、不可见的 PocketBase 初始密码，并以 `is_active=false` 写入；管理员完成身份核验后，通过 `POST /api/lab/members/{id}/reset-password` 设置 10–128 位临时密码并激活账号，成员首次登录后再从成员中心修改密码。首个业务管理员需要由受控超级管理员维护窗口直接设置密码，之后才能使用业务管理员端点处理学生账号。

导入完成后至少核对：源/目标用户、团队 membership、申请、资源和正文总数；三个团队分布；`pending`、`approved`、`rejected` 状态；同团队 Protected 正文/附件可读、跨团队拒绝；第二次导入报告为零新增；以及源 SQLite 字节未变化。旧库每个用户/团队关系会生成一条 `team_memberships`，导入账号保持停用，管理员重置密码后，原来已通过的关系才可用于资源授权。导入本身不执行生产切换、备份删除或旧服务下线。
