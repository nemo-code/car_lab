# car_lab 项目交接文档

> 给另一台电脑上的 Codex 使用。阅读后先检查 Git 状态、远端最新提交和线上 8081 状态，再继续未完成任务。

## 项目身份

- 本地目录：`D:\workspace1\三院项目\服务器\car-lab`
- GitHub 公开仓库：`https://github.com/nemo-code/car_lab`
- 默认分支：`main`
- 线上网站：`https://v2xb6205.nemotoken.fun/`
- 成员入口：`https://v2xb6205.nemotoken.fun/portal`
- 服务器：`8.156.83.206`，SSH 端口 `22`，使用新电脑上已配置的密钥。不要复制或提交私钥。

## 首要约束：8080 与 8081 隔离

- 三院项目使用 `8080`，必须保持原样。
- 实验室项目使用公网 `8081`，域名为 `v2xb6205.nemotoken.fun`。
- 实验室 Node API 仅监听服务器本机 `127.0.0.1:18081`；Nginx 将 HTTPS `/api` 转发到该端口。
- 发布、重启、备份和回滚只能操作 `/srv/site-8081`、`car-lab.service` 和实验室域名。
- 每次发布前后确认 `http://127.0.0.1:8080/` 状态仍为 `302`。不要操作 8080 的进程、目录、Nginx 配置或数据库。

## 技术结构

- 前端：Vue 3、Vite、Vue Router。
- 后端：Node.js 原生 HTTP 服务。
- 数据库：Node `node:sqlite` / SQLite。
- 密码：scrypt 哈希；会话为 HttpOnly、SameSite=Strict Cookie；生产要求 HTTPS。
- API：`server/index.js`、`server/platform.js`。
- 成员页面：`src/views/PortalPage.vue`；样式：`src/lab.css`。
- 测试：`server/platform.test.js`。
- systemd：`deploy/car-lab.service`。
- Nginx：`deploy/nemotoken-subdomain.nginx`。

## 已完成并在线上的功能

- 实验室首页及软件、硬件、游戏 / 仿真三个团队介绍页。
- 公开资源库、团队内部资源访问权限。
- 学生申请加入和管理员审核。
- 学号为学生账号唯一标识，11 位数字，例如 `25010720732`。
- 学号前两位自动成为年级标签，例如 `25` 显示为 `25级`。
- 用户名选填，可用学号或用户名登录；旧管理员邮箱登录兼容。
- 管理员审核列表显示学号、用户名和年级。
- 旧 SQLite 数据库启动时会迁移到新字段结构。

上一版线上信息：

- systemd 服务：`car-lab.service`，应为 `active`。
- 数据库：`/srv/site-8081/data/lab.sqlite`。
- 上一版回滚目录：`/srv/site-8081/backups/20261014-student-auth`。
- 管理员账号：`admin@nemotoken.fun`。
- 管理员初始密码只在仓库外文件 `D:\workspace1\三院项目\服务器\car-lab-admin-credentials.txt` 中。不要把密码写入 Git、终端输出、聊天或本文件。

## 当前未完成的用户需求

用户最新要求：申请说明选填；用户名继续选填；学生注册密码最低 6 位；成员修改密码最低 6 位；管理员初始化密码最低 12 位规则不变。

这项变更在交接时已在本地编辑，但**尚未提交、推送或部署**。涉及文件：

- `server/platform.js`：注册密码下限 6 位，申请说明可空但最多 1000 字，成员改密下限 6 位。
- `src/views/PortalPage.vue`：申请说明去掉必填并标为选填；注册密码和改密提示至少 6 位。
- `server/platform.test.js`：测试空申请说明与 6 位密码注册。
- `README-LAB.md`：同步规则说明。

接手第一步检查并保留这些本地改动：PowerShell 执行 `cd D:\workspace1\三院项目\服务器\car-lab`、`git status --short --branch` 和 `git diff`。不要丢弃改动，不要运行 `git reset --hard` 或 `git checkout --`。

## 本地验证

提交前运行：`npm test`、`npm run build`、`git diff --check`。

确认测试覆盖：6 位密码成功、5 位密码失败、空申请说明成功、空用户名成功、学号长度和重复校验、学号登录、设置用户名后的用户名登录、旧管理员邮箱登录、旧数据库迁移后账号/申请/会话保留。

可用 Playwright 检查 `/portal?mode=apply`：申请说明选填、密码至少 6 位、错误学号即时提示；`390x844` 手机视口无横向溢出，控制台无错误。

## GitHub 工作流

先执行 `git fetch origin main` 和 `git log --oneline --decorate --graph --all -12` 检查协作者提交。若远端领先，检查差异后快进或正常合并；禁止强制推送。

验证后执行：`git add server/platform.js src/views/PortalPage.vue server/platform.test.js README-LAB.md`；提交信息可用 `Relax student registration requirements`；再 `git push origin main`。最后检查 `git status --short --branch` 和 `git ls-remote --heads origin main`。

## 8081 生产发布

### 发布前只读检查

PowerShell 执行：`ssh root@8.156.83.206 "systemctl is-active car-lab.service; curl -fsS http://127.0.0.1:18081/api/health; curl -s -o /dev/null -w '8080=%{http_code}\n' http://127.0.0.1:8080/"`。预期服务为 `active`，健康接口返回 JSON，8080 返回 `302`。

### 构建和上传

每次发布使用新的 release 和 backup 目录，例如 `20261015-registration-rules`，不要复用已存在目录。先 `npm run build`，再在服务器创建 `/srv/site-8081/releases/20261015-registration-rules/dist` 和 `server`，上传 `dist/` 以及 `server/index.js`、`server/platform.js`、`server/content.js`、`server/bootstrap-admin.js`。

参考 `deploy/release-student-auth.sh` 编写新版本发布脚本并更新 release/backup 路径。该脚本固定使用旧目录，只能参考，不能原样重复执行。

切换前完整备份 `/srv/site-8081/data`、`server`、`www`、`/etc/systemd/system/car-lab.service` 和 `/etc/nginx/sites-available/v2xb6205.nemotoken.fun`。SQLite 运行时可能存在 `lab.sqlite-wal` 和 `lab.sqlite-shm`，必须备份整个 `data` 目录。

切换后验证：服务 `systemctl is-active car-lab.service`；健康接口 `curl -fsS http://127.0.0.1:18081/api/health`；未登录会话 `curl -fsS --resolve v2xb6205.nemotoken.fun:443:127.0.0.1 https://v2xb6205.nemotoken.fun/api/me` 应为 `{"data":null}`；裸 IP 的 HTTP 账户接口预期 `403`；8080 仍为 `302`。任一健康、HTTPS 页面或 8080 检查失败，立即停止新服务、恢复本次备份并重新启动旧服务。

## 数据和安全

- 不得删除或重建 `/srv/site-8081/data/lab.sqlite`。
- 不要提交数据库、管理员凭据、SSH 私钥、`.env`、`.pem`、`.key` 或浏览器会话文件。
- 不要在聊天、终端输出、日志或截图里展示管理员密码。
- 账户操作必须使用 HTTPS 域名，不能通过裸 IP 或 HTTP 登录。
- 用户输入必须由服务端校验；前端校验不能替代后端校验。
- 数据库迁移由 `server/platform.js` 启动时执行，生产发布前必须有回滚备份。

## 完成标准

只有在本地测试和构建通过、代码已推送至 `nemo-code/car_lab`、生产备份已创建、8081 健康接口和 HTTPS 页面验证通过、8080 保持原状、浏览器控制台无错误后，才可告知用户“已完成并上线”。回复提供提交号、线上地址和本次回滚目录。
