# 隔离部署与回滚

当前分支仍以 Node/SQLite 作为可运行路径。`deploy/pocketbase.service.example`
和 `deploy/pocketbase.nginx.example` 只用于经过验证的隔离环境，不能直接覆盖线上
8080/8081 配置。

systemd 样例使用绝对数据目录，因为 `ExecStart` 不会像 shell 那样展开 `${...}` 环境变量；
Nginx 样例将请求上限设为 32 MiB，为 30 MiB 文件的 multipart 头部预留空间，实际字段大小仍由
PocketBase 和业务 Hook 限制为 30 MiB。

PocketBase 运行目录应与网站静态目录分开：

```text
/srv/car-lab/www                 Vue 构建产物
/srv/car-lab/pocketbase          固定版本二进制、Hooks、迁移
/srv/car-lab/data/pb_data        SQLite 与受保护文件
/srv/car-lab/backups             一致性备份
```

切换前必须完成：

1. 保存旧 Node 代码、停止写入后的 SQLite 一致性快照、媒体素材、Nginx 与 systemd 配置。PocketBase 候选数据目录可用 `npm run pocketbase:backup -- create <pb_data> <backup_dir> --source-stopped` 生成带 SHA-256 清单的离线快照。
2. 在全新 `pb_data` 中运行固定版本迁移，并通过匿名、待审、同团队、跨团队和管理员权限测试。
3. 运行旧库预检与导入差异报告；旧密码哈希和旧 Session 不直接导入。
4. 维护窗口内停止新入口写入，完成最终核对后才调整 Nginx API 代理。
5. 观察健康接口、登录、审核、Protected 文件下载、错误日志和移动端页面。

回滚时先停止新入口写入，导出并核对切换期间新增数据，再恢复已验证的旧代码、旧 SQLite
和旧代理配置。PocketBase 数据恢复前先运行 `npm run pocketbase:restore -- <backup_dir> <pb_data> --replace`，由清单校验通过后再启动服务。不要直接用旧数据库覆盖新数据库，也不要删除 PocketBase 数据目录。

`node scripts/rollback-check.mjs` 只在临时目录演练文件级恢复，不代表生产恢复演练已经完成。
