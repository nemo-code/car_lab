const siteContract = require(__hooks + "/site-content-contract.cjs");
const sections = siteContract.siteSections;

function text(value, max) {
  const result = String(value || "").trim();
  if (!result || result.length > max) throw new BadRequestError("资源字段无效");
  return result;
}

function announcementInput(body, existing) {
  const slug = String(body.slug === undefined ? existing?.getString("slug") : body.slug || "").trim().toLowerCase();
  const title = text(body.title === undefined ? existing?.getString("title") : body.title, 160);
  const summary = String(body.summary === undefined ? existing?.getString("summary") : body.summary || "").trim();
  const content = text(body.body === undefined ? existing?.getString("body") : body.body, 20000);
  const kind = String(body.kind === undefined ? existing?.getString("kind") || "notice" : body.kind || "notice").trim();
  const status = String(body.status === undefined ? existing?.getString("status") || "draft" : body.status || "draft").trim();
  const pinned = booleanValue(body.pinned, existing ? existing.getBool("pinned") : false);
  const sortOrder = Number(body.sort_order === undefined ? existing?.getInt("sort_order") || 0 : body.sort_order);
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug) || summary.length > 500 ||
      ["notice", "news"].indexOf(kind) === -1 || ["draft", "published", "offline"].indexOf(status) === -1 ||
      !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    throw new BadRequestError("公告字段无效");
  }
  return { slug, title, summary, body: content, kind, status, pinned, sort_order: sortOrder };
}

function announcementRecord(record, includeBody) {
  if (!record) return null;
  const value = {
    id: record.id,
    slug: record.getString("slug"),
    title: record.getString("title"),
    summary: record.getString("summary"),
    kind: record.getString("kind"),
    status: record.getString("status"),
    pinned: record.getBool("pinned"),
    sort_order: record.getInt("sort_order"),
    published_at: record.getString("published_at") || null,
    created_at: record.getString("created"),
    updated_at: record.getString("updated"),
  };
  if (includeBody) value.body = record.getString("body");
  return value;
}

function resolveTeam(app, value) {
  const input = String(value || "").trim();
  if (!input) throw new BadRequestError("所属团队不能为空");
  const team = app.findFirstRecordByFilter("teams", "(id = {:value} || code = {:value}) && enabled = true", { value: input });
  if (!team) throw new BadRequestError("所属团队不存在或已停用");
  return team;
}

const resourceStatuses = ["draft", "published", "offline"];

function resourceInput(app, body, requiredBody, existing) {
  const lab = require(__hooks + "/lab.js");
  lab.only(body, ["team", "title", "summary", "visibility", "status", "body", "filename", "size"]);
  const team = resolveTeam(app, body.team);
  const input = {
    team: team.id,
    teamCode: team.getString("code"),
    title: text(body.title, 200),
    summary: text(body.summary, 1000),
    visibility: String(body.visibility || "public"),
    status: String(body.status === undefined ? existing?.getString("status") || "published" : body.status || "published"),
    body: String(body.body || ""),
    filename: String(body.filename || "").trim(),
    size: Number(body.size || 0),
  };
  if (["public", "team", "admin"].indexOf(input.visibility) === -1 || resourceStatuses.indexOf(input.status) === -1 || input.body.length > 100000 || input.filename.length > 255 ||
      !Number.isInteger(input.size) || input.size < 0 || input.size > 31457280 || (requiredBody && !input.body)) {
    throw new BadRequestError("资源字段无效");
  }
  return input;
}

function saveContent(app, resource, input, existing) {
  const content = existing || new Record(app.findCollectionByNameOrId("resource_contents"));
  content.load({ resource: resource.id, team: resource.getString("team"), body: input.body, filename: input.filename, size: input.size });
  app.save(content);
  return content;
}

function teamInput(body, existing) {
  const lab = require(__hooks + "/lab.js");
  lab.only(body, ["name", "caption", "image", "intro", "learn", "practice", "sort_order", "enabled"]);
  const name = text(body.name === undefined ? existing.getString("name") : body.name, 80);
  const caption = text(body.caption === undefined ? "" : body.caption, 160);
  const image = text(body.image === undefined ? "" : body.image, 500);
  const intro = text(body.intro === undefined ? "" : body.intro, 2000);
  const practice = text(body.practice === undefined ? "" : body.practice, 1000);
  const learn = Array.isArray(body.learn) ? body.learn.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12) : [];
  const sort = Number(body.sort_order === undefined ? existing.getInt("sort") : body.sort_order);
  const enabled = body.enabled === undefined ? existing.getBool("enabled") : Boolean(body.enabled);
  if (!caption || !image || !intro || !practice || !learn.length || learn.some((item) => item.length > 160) || !Number.isInteger(sort) || sort < 0 || sort > 9999) {
    throw new BadRequestError("团队字段无效");
  }
  return { name, caption, image, intro, learn, practice, sort, enabled };
}

function projectList(value, max) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, max);
}

function projectAssets(value, max) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item.trim();
    if (!item || typeof item !== "object") return null;
    const label = String(item.label || "").trim();
    const path = String(item.path || item.url || "").trim();
    return label && path ? { label: label.slice(0, 160), path: path.slice(0, 500) } : null;
  }).filter(Boolean).slice(0, max);
}

function projectInput(body) {
  const textField = (key, max, required) => {
    const value = String(body[key] || "").trim();
    if (required && !value) throw new BadRequestError("项目字段无效");
    if (value.length > max) throw new BadRequestError("项目字段过长");
    return value;
  };
  const category = textField("category", 20, true);
  const status = textField("status", 20, true) || "published";
  if (["hardware", "software", "game"].indexOf(category) === -1 || ["draft", "published", "offline"].indexOf(status) === -1) {
    throw new BadRequestError("项目分类或状态无效");
  }
  const slug = textField("slug", 80, true).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug)) throw new BadRequestError("项目标识无效");
  return {
    legacy_id: textField("legacy_id", 80, false), edition: textField("edition", 80, false) || "custom", slug,
    group_label: textField("group_label", 120, true), category, category_label: textField("category_label", 80, true),
    title: textField("title", 200, true), subtitle: textField("subtitle", 300, true), summary: textField("summary", 2000, true),
    tags: projectList(body.tags, 24), highlights: projectList(body.highlights, 24), outcomes: projectList(body.outcomes, 24), tech: projectList(body.tech, 24),
    members_text: textField("members_text", 500, false), media: projectAssets(body.media, 24), videos: projectAssets(body.videos, 24), files: projectAssets(body.files, 24),
    accent: textField("accent", 40, false) || "cyan", sort_order: Math.max(0, Math.min(9999, Number(body.sort_order || 0))), status,
  };
}

const projectAssetKinds = ["image", "video", "file"];
const projectAssetSources = ["upload", "legacy", "external"];
const projectAssetAvailability = ["available", "missing", "offline"];

function legacyAssetPathExists(legacyPath) {
  const value = String(legacyPath || "").trim();
  if (!value || value.startsWith("../") || /^https?:\/\//i.test(value)) return false;
  let publicRoot = "";
  try { publicRoot = String($os.getenv("CAR_LAB_PUBLIC_DIR") || "").trim(); } catch (_) {}
  if (!publicRoot) {
    try { publicRoot = $filepath.join(__hooks, "..", "..", "public"); } catch (_) {}
  }
  if (!publicRoot) return false;
  try {
    const assetRoot = $filepath.join(publicRoot, "projects", "xiaoxueqi-2026", "showcase-site");
    const candidate = $filepath.join(assetRoot, value);
    const prefix = assetRoot.endsWith("/") ? assetRoot : `${assetRoot}/`;
    if (candidate.indexOf(prefix) !== 0) return false;
    const info = $os.stat(candidate);
    return Boolean(info && !info.isDir());
  } catch (_) {
    return false;
  }
}

function resolveProject(app, value) {
  const input = String(value || "").trim();
  if (!input) throw new BadRequestError("项目不能为空");
  const project = app.findFirstRecordByFilter("projects", "id = {:value} || slug = {:value}", { value: input });
  if (!project) throw new BadRequestError("项目不存在");
  return project;
}

function booleanValue(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].indexOf(String(value).trim().toLowerCase()) !== -1;
}

function projectAssetInput(app, body, existing) {
  const lab = require(__hooks + "/lab.js");
  lab.only(body, ["project", "kind", "label", "source_type", "availability", "legacy_path", "sort_order", "published"]);
  const project = resolveProject(app, body.project === undefined ? existing?.getString("project") : body.project);
  const kind = String(body.kind === undefined ? existing?.getString("kind") : body.kind || "").trim();
  const label = text(body.label === undefined ? existing?.getString("label") : body.label, 160);
  const sourceType = String(body.source_type === undefined ? existing?.getString("source_type") : body.source_type || "upload").trim();
  const availability = String(body.availability === undefined ? existing?.getString("availability") : body.availability || "available").trim();
  const legacyPath = String(body.legacy_path === undefined ? existing?.getString("legacy_path") : body.legacy_path || "").trim();
  const sortOrder = Number(body.sort_order === undefined ? existing?.getInt("sort_order") || 0 : body.sort_order);
  const published = booleanValue(body.published, existing ? existing.getBool("published") : false);
  const existingFile = existing ? existing.getString("file") : "";
  if (projectAssetKinds.indexOf(kind) === -1 || projectAssetSources.indexOf(sourceType) === -1 ||
      projectAssetAvailability.indexOf(availability) === -1 || legacyPath.length > 500 ||
      !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999 ||
      (sourceType === "legacy" && !legacyPath) || (published && availability !== "available") ||
      (sourceType === "legacy" && availability === "available" && !legacyAssetPathExists(legacyPath)) ||
      (existing && sourceType === "upload" && availability === "available" && !existingFile)) {
    throw new BadRequestError("项目素材字段无效");
  }
  return { project, kind, label, source_type: sourceType, availability, legacy_path: legacyPath, sort_order: sortOrder, published };
}

function validateProjectAssetFile(kind, file) {
  const mime = String(file?.type || "").toLowerCase();
  const filename = String(file?.name || file?.originalName || "").toLowerCase();
  const extension = filename.lastIndexOf(".") >= 0 ? filename.slice(filename.lastIndexOf(".")) : "";
  const allowed = {
    image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    video: ["video/mp4", "video/webm", "video/quicktime"],
    file: ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "application/zip",
      "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  };
  const extensions = {
    image: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
    video: [".mp4", ".webm", ".mov"],
    file: [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".txt", ".zip", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"],
  };
  const typeValid = mime ? allowed[kind]?.includes(mime) : extensions[kind]?.includes(extension);
  if (!file || Number(file.size || 0) < 1 || Number(file.size || 0) > 31457280 || !typeValid) {
    throw new BadRequestError("项目素材文件类型或大小无效");
  }
}

function projectAssetRecord(app, record) {
  const filename = record.getString("file");
  const project = app.findRecordById("projects", record.getString("project"));
  return {
    id: record.id,
    project_id: record.getString("project"),
    project_slug: project.getString("slug"),
    kind: record.getString("kind"),
    label: record.getString("label"),
    source_type: record.getString("source_type"),
    availability: record.getString("availability"),
    legacy_path: record.getString("legacy_path"),
    filename,
    file: filename,
    size: record.getInt("size") || 0,
    mime: record.getString("mime"),
    sort_order: record.getInt("sort_order"),
    published: record.getBool("published"),
    url: filename
      ? `/api/files/project_assets/${record.id}/${encodeURIComponent(filename)}`
      : record.getString("source_type") === "external" && /^https?:\/\//i.test(record.getString("legacy_path"))
        ? record.getString("legacy_path")
        : record.getString("source_type") === "legacy" && record.getString("legacy_path") && !record.getString("legacy_path").startsWith("../")
          ? `/projects/xiaoxueqi-2026/showcase-site/${record.getString("legacy_path")}`
          : "",
    created_by: record.getString("created_by"),
    created_at: record.getString("created"),
    updated_at: record.getString("updated"),
  };
}

module.exports = {
  sections,
  resourceStatuses,
  announcementInput,
  announcementRecord,
  resourceInput,
  saveContent,
  projectInput,
  teamInput,
  resolveProject,
  projectAssetInput,
  validateProjectAssetFile,
  projectAssetRecord,
  validateSiteSection: siteContract.validateSiteSection,
  validateSitePayload: siteContract.validateSitePayload,
  validateSitePayloadSize: siteContract.validateSitePayloadSize,
};
