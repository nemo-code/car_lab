# PocketBase 隔离原型

对应技术方案 S1/S2 的可审查实现。旧 Node API 和现有数据库仍保留为默认回滚路径；前端已提供显式 `VITE_PLATFORM_BACKEND=pocketbase` adapter，但不会自动启动实例或迁移数据。

## 版本与执行边界

`version.json` 将版本固定为 **0.40.5**。当前已在 macOS arm64 和 Linux arm64 隔离环境完成官方二进制 SHA-256 与迁移、权限、停用和 Protected 文件验证，二进制摘要按平台记录在 `binarySha256ByPlatform` 中，状态保留为 `isolated-verified-darwin_arm64` 以兼容既有门禁。这不等于生产就绪；不能使用 `latest` 或跳过备份直接切换。

在开发机取得官方固定版本并核验 SHA-256 后，先备份，再为此原型创建全新隔离数据目录。官方 CLI 示例（需把路径替换为已核验的本机路径）：

```sh
/verified/path/pocketbase serve --http=127.0.0.1:18082 --dir=/private/scratch/car-lab-pb --hooksDir=./pocketbase/pb_hooks --migrationsDir=./pocketbase/pb_migrations --automigrate=false
```

以上仅为开发示例，不表示端口已检查或服务已配置。`serve` 会自动执行尚未应用的迁移；不可将 `--dir` 指向任何既有库或生产数据。迁移采用新建集合；遇到已有同名集合应停止核对，不能删除已有集合来强行通过。

数据库、文件存储、备份和二进制不纳入 Git。不允许将数据目录映射到 Nginx 静态目录，或放入 `public/`、`dist/`。原生 `/_/` 管理入口仅用于受控初始化，业务管理员为 `users.role=admin`，不向浏览器发送超级管理员凭据。

## 集合与权限

- `users`：学号/小写用户名登录；学生公开注册只走 `/api/lab/apply`；普通用户只查看本人，管理员可查询。迁移账号的旧 SQLite 用户 ID 仅以不公开的 `legacy_user_id` 保存，用于受控对账，不能作为登录身份。所有标准创建、更新、删除以及 `manageRule` 都锁定。字段权限由受控端点白名单保持。
- `teams`：预置三个团队，启用团队可公开读取，管理员可维护，禁止常规删除。
- `applications`：本人或管理员可读，创建、审批仅走事务端点，重复审批失败；迁移保留同一成员的历史申请记录。
- `team_memberships`：每个用户与团队一条唯一关系；`pending/approved/rejected/revoked` 独立记录，申请第二团队、管理员撤销与恢复均走受控端点。
- `resources`：已发布条目的摘要允许公开（包括内部资源摘要），草稿与下线仅管理员可读；不得把敏感正文写入摘要。标准 create/update/delete 规则锁定，只能通过受控管理员端点写入并审计。
- `resource_contents`：正文与附件独立；`file` Protected，30 MiB，MIME 白名单；标准集合接口只公开已发布的公开正文和管理员正文，团队正文统一通过 `/api/lab/resources/{id}` 受控端点读取。团队附件和正文须存在同团队、启用且通过审批的 `team_memberships` 关系；管理员可跨团队访问。标准写入规则锁定，正文和附件均通过资源受控端点写入。复制 URL 和自然过期 Token 已在隔离 PocketBase 0.40.5 中验证，证据见 [`docs/pocketbase-runtime-validation.md`](../docs/pocketbase-runtime-validation.md)；其他版本或部署平台仍需复验。
- `projects`：项目成果目录，保存 `legacy_id`、批次、分类、排序、简介、技术标签、图片路径以及视频/文档历史引用；只有 `published` 项目公开，草稿和下线记录仅管理员可见。标准写入规则锁定，后台通过受控项目端点审计新增、编辑和下线。
- `project_assets`：项目媒体隔离候选。每条记录绑定一个 `projects` 项目，区分 `image/video/file`、`upload/legacy/external` 来源和 `available/missing/offline` 状态；上传文件受 30 MiB 与 MIME 白名单限制。匿名读取只返回已发布且可用、且所属项目已发布的素材；管理员可通过受控端点查看、编辑、替换和下线。旧项目中的 `projects.media/videos/files` 路径引用继续保留，迁移不会把仓库外历史文件伪造成 PocketBase 附件。
- `site_pages`：仅已发布内容公开；标准写入规则锁定，官网编辑使用受控管理员端点，首次初始化使用仅超级管理员可访问的 seed 端点。
- `audit_logs`：仅管理员可读，API 写入、更新、删除锁定。申请、审核、停用、密码操作在同一事务写审计；审计仅保存状态，无密码、Token 或姓名。

资源和页面写入统一走受控管理员端点并在事务内写审计。管理后台已提供文件选择和 30 MiB 前端限制；文件 MIME 过滤不能替代恶意文件扫描，仍需在集成环境补充真实文件上传、过期 Token 和失败恢复回归。

## 首次内容初始化

PocketBase 迁移只创建集合和团队，不把官网正文硬编码进 schema。首次创建隔离实例后，使用受控管理员 Token 将现有 `server/content.js` 的完整公开内容写入 `site_pages`：

```sh
POCKETBASE_URL=http://127.0.0.1:18082 \
POCKETBASE_ADMIN_TOKEN='<短期超级管理员 Token>' \
npm run pocketbase:seed-site -- --apply
```

不带 `--apply` 时只读取目标记录并输出待创建/更新及 payload 大小，不写入数据。命令不会打印 Token 或官网正文。

静态 2026 小学期成果使用独立的幂等 seed 命令导入 `projects` 集合。它保留图片的 `assets/...` 路径和仓库外视频/文档的原始引用；缺失的历史文件不会被伪造成可下载附件。该初始化命令使用短期超级管理员 Token 直接写入集合，业务管理员日常编辑仍必须走受控端点：

```sh
POCKETBASE_URL=http://127.0.0.1:18082 \
POCKETBASE_ADMIN_TOKEN='<短期超级管理员 token>' \
npm run pocketbase:seed-projects -- --apply
```

## 端点

| 方法及路径 | 请求 | 说明 |
| --- | --- | --- |
| `POST /api/lab/apply` | `name, student_id, username?, team, statement?, password` | team 为 `software/hardware/simulation`；用户名如填写须为 3–30 位小写 ASCII，密码 10–128 位；成功返回申请 ID 和 pending |
| `POST /api/lab/apply-team` | `team, statement?` | 已登录成员申请第二团队；每个用户/团队关系只能有一个待审或已通过申请 |
| `POST /api/lab/applications/{id}/review` | `status: approved/rejected, note?` | 实验室管理员；原子更新用户、申请、审计；刷新 Token key |
| `GET /api/lab/announcements` | 无 | 公开读取已发布公告 |
| `GET /api/lab/announcements/{ref}` | 无 | 按 ID 或 slug 读取已发布公告详情 |
| `GET /api/lab/admin/announcements` | 无 | 管理员读取草稿、已发布和已下线公告 |
| `POST /api/lab/admin/announcements` | `slug, title, summary, body, kind, status, pinned, sort_order` | 管理员创建公告并写入审计 |
| `PATCH /api/lab/admin/announcements/{id}` | 同上 | 管理员编辑公告并写入审计 |
| `POST /api/lab/admin/announcements/{id}/offline` | 空请求体 | 管理员下线公告并写入审计 |
| `GET /api/lab/admin/memberships` | 无 | 管理员读取全部团队成员关系 |
| `POST /api/lab/admin/memberships/{id}/revoke` | 空请求体 | 管理员撤销单条团队关系 |
| `POST /api/lab/admin/memberships/{id}/restore` | 空请求体 | 管理员恢复单条团队关系 |
| `POST /api/lab/members/{id}/active` | `is_active: boolean` | 管理员启停学生；刷新 Token key |
| `POST /api/lab/members/{id}/reset-password` | `password` | 管理员核验身份后设置 10–128 位临时密码并激活迁移账号；刷新 Token key |
| `POST /api/lab/password` | `old_password, password` | 成员更改本人密码，所有旧 Token 作废后重新登录 |
| `POST /api/lab/resources` | `team, title, summary, visibility, body, filename?, size?` | 管理员创建目录和私有正文，并写入资源审计 |
| `PATCH /api/lab/resources/{id}` | 同上 | 管理员更新目录、正文和资源审计 |
| `GET /api/lab/resources/{id}` | 无 | 公开资源匿名可读；团队资源要求启用且通过审批的同团队 membership；管理员可跨团队读取正文 |
| `POST /api/lab/resources/{id}/file` | multipart `file, body, filename, size` | 管理员上传或替换受保护附件并写入资源审计 |
| `POST /api/lab/resources/{id}/offline` | 空请求体 | 管理员下线资源并写入资源审计 |
| `POST /api/lab/projects` | 项目结构化字段和素材引用数组 | 管理员新增项目并写入项目审计 |
| `PATCH /api/lab/projects/{id}` | 同上 | 管理员编辑项目并写入项目审计 |
| `POST /api/lab/projects/{id}/offline` | 空请求体 | 管理员下线项目并写入项目审计 |
| `GET /api/lab/projects/{id}/assets` | 无 | 已发布项目的匿名读取只返回可用素材；管理员可读取该项目全部素材 |
| `POST /api/lab/projects/{id}/assets` | multipart `kind, label, source_type, availability, legacy_path?, sort_order?, published?, file?` | 管理员创建素材 metadata；上传来源需要文件；写入素材审计 |
| `PATCH /api/lab/project-assets/{id}` | `kind, label, source_type, availability, legacy_path?, sort_order?, published?` | 管理员编辑素材 metadata；发布前必须为可用状态 |
| `POST /api/lab/project-assets/{id}/file` | multipart `file` | 管理员替换素材文件；替换后自动取消发布，需重新发布 |
| `POST /api/lab/project-assets/{id}/offline` | 空请求体 | 管理员下线素材并清除文件元数据 |
| `PATCH /api/lab/teams/{id}` | `name, caption, image, intro, learn, practice, sort_order, enabled` | 管理员编辑团队展示内容并写入团队审计；公开列表仍通过 `teams` 集合读取启用团队 |
| `PATCH /api/lab/site` | `section, value` | 管理员更新官网区块并写入内容审计 |
| `POST /api/lab/site-seed` | `payload` | 仅超级管理员用于首次官网内容初始化，重复执行幂等 |

登录采用标准 `users.authWithPassword()`。应用级迁移会对访客申请和密码登录启用固定窗口限流：申请接口每分钟最多 5 次，登录接口每分钟最多 10 次；超出后由 PocketBase 返回 `429`，部署时仍应在 Nginx 或上游防火墙补充更宽的 IP/代理边界策略。未经验证不得导入旧密码哈希。迁移账号使用随机不可见初始密码并保持停用，管理员完成身份核验后通过上面的受控端点设置临时密码；首次登录后应要求成员自行修改密码。

## 本地结构检查

```sh
node --test pocketbase/scaffold.test.mjs
```

结构测试仅检查 JS 可解析、集合依赖、默认拒绝写入、Protected 字段及 Hooks 注册。**它不能证明 PocketBase 接受规则或 API 实际安全。** 固定版本 0.40.5 的 macOS arm64 空库已继续完成 AUTH、APP、RES、FILE、MIG 和浏览器冒烟验证，包括 `identityFields`、关联规则、事务流程、停用后的旧文件 Token、文件直接访问与自然过期；Linux ARM64 也通过隔离迁移、合成 SQLite 导入、备份恢复和项目素材验证。命令、版本摘要和证据边界见 [`docs/pocketbase-runtime-validation.md`](../docs/pocketbase-runtime-validation.md)。这些隔离验证不替代生产备份恢复、真实数据导入核对或部署切换验收。

`project_assets` 仍是隔离候选能力，不代表已经完成生产媒体迁移或发布切换。固定版本 0.40.5
空库的真实 multipart 上传、公开文件 URL、替换后的重新发布、下线后的旧 URL 失效和项目下线
隐藏已由 `npm run verify:pocketbase-project-assets` 验证；该命令使用临时数据目录并清理现场。
Linux ARM64 目标二进制及隔离备份恢复后的文件一致性已完成验证；生产数据恢复、媒体迁移和切换仍需单独核验、备份、回滚与部署授权。

本迁移拒绝自动 `down`，以免删除导入成员和文件。回滚须恢复匹配版本的一致性 `pb_data` 备份及二进制；生产迁移、切换与恢复需要单独授权。

参考：[迁移](https://pocketbase.io/docs/js-migrations/)、[API Rules](https://pocketbase.io/docs/api-rules-and-filters/)、[Protected 文件](https://pocketbase.io/docs/files-handling/)、[JS Hooks](https://pocketbase.io/docs/js-event-hooks/)、[MIT 许可](https://github.com/pocketbase/pocketbase/blob/master/LICENSE.md)。正式分发二进制时保留其原始许可。
