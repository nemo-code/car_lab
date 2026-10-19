# 联系入口兼容契约

`/contact` 和旧的大小写路径继续保留为兼容入口，并跳转到 `/portal?mode=apply`。当前首期只支持统一的成员申请流程；前端不再暴露旧的 `submitContact` 或 `submitRecruitment` 调用，也没有为它们创建 PocketBase 集合。

旧 Node 服务端点仍保留在回滚服务中，但不属于 PocketBase 部署契约。任何新的联系或招新业务需要单独设计集合、权限、保留期限和审计后再接入。
