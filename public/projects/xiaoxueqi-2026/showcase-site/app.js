const PROJECTS = [{"id": "hw1", "group": "硬件一组", "category": "hardware", "categoryLabel": "硬件实物", "title": "智能循迹小车设计与实现", "subtitle": "双闭环控制 · 8 路灰度感知 · 实时状态显示", "summary": "以 STM32 为核心，完成电源、驱动、编码器测速、8 路灰度采集与循迹/速度双闭环控制，让小车在真实赛道上稳定、快速地“自己找路”。", "tags": ["STM32", "PID 双闭环", "灰度传感器", "OLED"], "highlights": ["12V→5V 分级供电与整车装配", "TB6612 电机驱动 + MG513 编码器测速", "8 路灰度传感器计算黑线位置误差", "循迹与速度双闭环控制，支持 OLED 调试"], "outcomes": ["稳定循迹", "速度闭环", "软硬件联调"], "tech": ["STM32 标准库", "PWM", "编码器", "PD/PID", "OLED"], "members": "黄智雄、江雨芯", "media": ["assets/硬件一组-slide-1.jpeg", "assets/硬件一组-slide-2.png", "assets/硬件一组-slide-3.png", "assets/硬件一组-slide-4.jpeg"], "videos": [{"label": "演示视频.mp4", "path": "../硬件一组/项目资料/演示视频.mp4"}], "files": [{"label": "成果汇报 PPT", "path": "../硬件一组/智能循迹小车设计与实现-硬件1组实训汇报.pptx"}, {"label": "项目报告", "path": "../硬件一组/硬件1组-小学期实训报告模板.docx"}, {"label": "代码展示", "path": "../硬件一组/项目资料/代码展示.docx"}], "accent": "cyan"}, {"id": "hw2", "group": "硬件二组", "category": "hardware", "categoryLabel": "硬件实物", "title": "普中 51 单片机红外循迹小车", "subtitle": "51 单片机 · 红外循迹 · 方向控制", "summary": "围绕普中 51 单片机小车平台，完成基础前后左右运动、红外循迹和整车演示，把“传感器读数”转化成可见、可控、可重复的运动效果。", "tags": ["51 单片机", "红外循迹", "电机驱动", "小车控制"], "highlights": ["按键控制前进、后退、左转、右转", "红外传感器识别路线并控制差速", "配套演示视频，覆盖手动与循迹两类模式", "适合用于入门级嵌入式教学展示"], "outcomes": ["基础运动控制", "循迹演示", "嵌入式入门"], "tech": ["C 语言", "51 MCU", "红外传感器", "PWM"], "members": "李语嫣、胥竞之、刘安成", "media": ["assets/硬件二组-slide-1.jpeg", "assets/硬件二组-slide-2.png", "assets/硬件二组-slide-3.png", "assets/硬件二组-slide-4.png"], "videos": [{"label": "小车按键前进后退左转右转.mp4", "path": "../硬件二组/项目资料（代码、文件、演示视频或截图）一份/小车按键前进后退左转右转.mp4"}, {"label": "小车循迹.mp4", "path": "../硬件二组/项目资料（代码、文件、演示视频或截图）一份/小车循迹.mp4"}], "files": [{"label": "成果汇报 PPT", "path": "../硬件二组/普中51单片机智能小车项目汇报 (1).pptx"}, {"label": "项目代码说明", "path": "../硬件二组/项目资料（代码、文件、演示视频或截图）一份/小学期普中51小车项目代码.docx"}], "accent": "cyan"}, {"id": "hw3", "group": "硬件三组", "category": "hardware", "categoryLabel": "硬件实物", "title": "基于 STM32 的智能小车设计", "subtitle": "超声波避障 · 红外循迹 · 蓝牙遥控", "summary": "把感知、决策、执行、通信四个模块装进一台四驱小车：它能感知障碍物，沿黑线行驶，也能通过蓝牙接收手机指令完成遥控。", "tags": ["STM32", "HC-SR04", "TCRT4000", "HC-06"], "highlights": ["HC-SR04 + SG90 舵机云台扫描避障", "四路红外 + 增量式 PID 循迹，偏差不超过 4mm", "HC-06 蓝牙透传，手机指令延迟约 120ms", "失线保护、差速转向和全项测试"], "outcomes": ["避障绕行", "稳定循迹", "手机遥控"], "tech": ["STM32", "L298N", "超声波", "PID", "蓝牙串口"], "members": "陈金螺、柏楷锋、周文", "media": ["assets/硬件三组-slide-1.png", "assets/硬件三组-slide-2.jpg", "assets/硬件三组-slide-3.jpg", "assets/硬件三组-slide-4.jpg"], "videos": [{"label": "蓝牙控制小车.mp4", "path": "../硬件三组/项目资料/蓝牙控制小车.mp4"}, {"label": "小车避障.mp4", "path": "../硬件三组/项目资料/小车避障.mp4"}, {"label": "小车循迹.mp4", "path": "../硬件三组/项目资料/小车循迹.mp4"}], "files": [{"label": "成果汇报 PPT", "path": "../硬件三组/基于STM32的智能小车设计.pptx"}, {"label": "项目报告", "path": "../硬件三组/硬件组3组-小学期实训报告.docx"}, {"label": "Keil 工程源码", "path": "../硬件三组/项目资料/红外循迹"}], "accent": "cyan"}, {"id": "hw4", "group": "硬件四组", "category": "hardware", "categoryLabel": "硬件实物", "title": "STM32 智能小车避障与红外循迹系统", "subtitle": "自动避障 · 红外循迹 · 车载控制实践", "summary": "围绕智能小车的自动感知与运动控制展开实践，完成从 STM32 底层驱动到整车联调的闭环验证，突出“能跑起来、能稳定运行、能现场演示”。", "tags": ["STM32", "自动避障", "红外循迹", "整车联调"], "highlights": ["完成智能小车硬件搭建与底层驱动", "实现前方障碍物检测与避障决策", "结合红外传感器完成循迹控制", "通过演示视频验证整车运行效果"], "outcomes": ["底层驱动", "整车联调", "功能验证"], "tech": ["STM32", "电机驱动", "红外传感器", "超声波"], "members": "魏雅莉", "media": ["assets/硬件四组-slide-1.jpeg", "assets/硬件四组-slide-2.jpeg", "assets/硬件四组-slide-3.jpeg"], "videos": [{"label": "cfc7aa8220dc934dd77e32ea228ee10b.mp4", "path": "../硬件四组/cfc7aa8220dc934dd77e32ea228ee10b.mp4"}], "files": [{"label": "成果汇报 PPT", "path": "../硬件四组/基于STM32智能小车的避障与红外循迹系统-答辩PPT.pptx"}, {"label": "项目报告", "path": "../硬件四组/24016020727-魏雅莉-小学期实训报告.docx"}], "accent": "cyan"}, {"id": "hw5", "group": "硬件五组", "category": "hardware", "categoryLabel": "硬件 + AI", "title": "果实成熟度智能监测与采摘决策系统", "subtitle": "树莓派 · 视觉识别 · 农业智能化", "summary": "将嵌入式平台、机器视觉与农业场景结合，围绕果实成熟度识别、状态监测与采摘决策，探索智能网联技术在真实生产问题中的落地。", "tags": ["树莓派", "机器视觉", "成熟度检测", "采摘决策"], "highlights": ["基于树莓派搭建边缘侧感知平台", "围绕果实状态进行智能监测与分级", "将识别结果转化为可执行的采摘决策", "适合延展到智慧农业与机器人方向"], "outcomes": ["边缘计算", "视觉识别", "场景落地"], "tech": ["Raspberry Pi", "图像处理", "分类决策", "智能农业"], "members": "邓卜弋、黄滢芝、杜秀梅", "media": ["assets/硬件五组-slide-1.png", "assets/硬件五组-slide-2.png", "assets/硬件五组-slide-3.png", "assets/硬件五组-slide-4.png"], "videos": [{"label": "演示视频1.mp4", "path": "../硬件五组/演示视频1.mp4"}, {"label": "演示视频2.mp4", "path": "../硬件五组/演示视频2.mp4"}], "files": [{"label": "成果汇报 PPT", "path": "../硬件五组/果实成熟度智能监测与采摘决策系统 .pptx"}, {"label": "项目报告 1", "path": "../硬件五组/24016021316-邓卜弋-小学期实训报告(2).docx"}, {"label": "项目报告 2", "path": "../硬件五组/24016021531-黄滢芝-小学期实训报告.docx"}], "accent": "lime"}, {"id": "sw1", "group": "软件一组", "category": "software", "categoryLabel": "软件系统", "title": "HelloCar 车载沙盘 App", "subtitle": "Compose 座舱 · CAN 数据 · 诊断与报警", "summary": "以 Kotlin + Jetpack Compose 构建车载沙盘 App，打通真实 CAN 被动读取链路、TCP JSON Lines 接收、诊断记录、报警中心与教学仿真模式。", "tags": ["Kotlin", "Jetpack Compose", "CAN", "车载沙盘"], "highlights": ["主界面、设置页、诊断页、报警中心和 360 全景页", "通过 adb_can / TCP JSON Lines 接收车辆遥测", "真实数据与教学仿真数据分离并标注来源", "支持低电量、胎压、超速等报警演示"], "outcomes": ["真实数据接入", "诊断可视化", "安全边界设计"], "tech": ["Kotlin", "Compose", "Python CAN Bridge", "TCP JSON Lines"], "members": "李欣玥、徐璐瑶、余俊虎、张园", "media": ["assets/软件一组-slide-1.jpeg", "assets/软件一组-slide-2.png", "assets/软件一组-slide-3.jpeg", "assets/软件一组-slide-4.jpeg"], "videos": [], "files": [{"label": "成果汇报 PPT", "path": "../软件一组/HelloCar车载沙盘App项目演示.pptx"}, {"label": "项目报告", "path": "../软件一组/软件一组-小学期实训报告--HelloCar.docx"}, {"label": "App 工程压缩包", "path": "../软件一组/MyApplicationcar.7z"}], "accent": "violet"}, {"id": "sw2", "group": "软件二组", "category": "software", "categoryLabel": "软件系统", "title": "Smart Copilot 智能驾驶辅助", "subtitle": "CAN 状态 · 疲劳检测 · 语音告警", "summary": "面向 Android 车机平台，整合 CAN 车辆状态、CameraX + ML Kit 人脸检测、PERCLOS 疲劳判断、行程统计与 TTS 语音告警。", "tags": ["Android", "CameraX", "ML Kit", "PERCLOS"], "highlights": ["车速、档位、电量、续航、胎压实时显示", "摄像头采集面部状态，计算 PERCLOS 疲劳指标", "超速/疲劳触发界面横幅与 TTS 语音告警", "把数据采集、判断、告警和展示串成闭环"], "outcomes": ["驾驶状态感知", "主动安全提醒", "端侧 AI"], "tech": ["Kotlin", "AIDL", "CameraX", "ML Kit", "TTS"], "members": "唐嘉潞", "media": ["assets/软件二组-slide-1.png", "assets/软件二组-slide-2.png", "assets/软件二组-slide-3.png", "assets/软件二组-slide-4.png"], "videos": [], "files": [{"label": "成果汇报 PPT", "path": "../软件二组/smart-copilot-ppt.pptx"}, {"label": "项目报告", "path": "../软件二组/24016021434-唐嘉潞-小学期实训报告.docx"}, {"label": "实习周报", "path": "../软件二组/24016021434-唐嘉潞-小学期实训实习周报.docx"}], "accent": "violet"}, {"id": "sw3", "group": "软件三组", "category": "software", "categoryLabel": "软件系统", "title": "HELLOCAR 车载智能驾驶辅助系统", "subtitle": "真实 CAN · SocketCAN · 疲劳检测", "summary": "以 Android + Compose 为 UI，使用 NDK + SocketCAN 读取 can0 真实 CAN 帧并解码车辆状态，同时集成 CameraX、ML Kit、语音指令与智能告警。", "tags": ["Android Compose", "NDK", "SocketCAN", "智能告警"], "highlights": ["can0 真实 CAN 帧读取与信号映射", "车速、挡位、电量、转向灯等状态实时刷新", "CameraX + PERCLOS 疲劳检测与提示", "语音指令、阈值设置和降级策略完善"], "outcomes": ["底层数据链路", "多源融合", "驾驶辅助"], "tech": ["Kotlin", "C++ NDK", "SocketCAN", "CameraX", "ML Kit"], "members": "史予让", "media": ["assets/软件三组-slide-1.png", "assets/软件三组-slide-2.png", "assets/软件三组-slide-3.jpeg", "assets/软件三组-slide-4.png"], "videos": [], "files": [{"label": "成果汇报 PPT", "path": "../软件三组/HelloCar项目汇报PPT.pptx"}, {"label": "项目报告", "path": "../软件三组/软件三组-小学期实训报告.docx"}, {"label": "项目工程压缩包", "path": "../软件三组/HELLOCAR项目.zip"}], "accent": "violet"}, {"id": "game", "group": "游戏组", "category": "game", "categoryLabel": "仿真交互", "title": "驰界回响 · 模拟驾驶游戏", "subtitle": "Unity 车辆动力学 · Photon 联机 · 座舱娱乐", "summary": "用 Unity 把智能座舱变成可玩的多人驾驶场景：支持方向盘/键盘双输入、房间联机、实时聊天、驾驶舱视角与车载娱乐。", "tags": ["Unity", "Photon PUN 2", "C#", "多人联机"], "highlights": ["Prometeo Car Controller 车辆动力学与方向盘输入", "Photon PUN 2 房间管理、玩家同步与实时聊天", "驾驶舱内饰替换、多视角摄像机与 HUD", "音乐电台、时钟、昼夜天空盒等车载娱乐"], "outcomes": ["沉浸式座舱", "多人协作", "交互设计"], "tech": ["Unity 2022", "C#", "Photon PUN 2", "WheelCollider"], "members": "赵泽增、邹杰、卢蓝、肖盈盈、陈芮、裴镜铃、陈姿颐", "media": ["assets/游戏组-slide-1.jpeg", "assets/游戏组-slide-2.png", "assets/游戏组-slide-3.png", "assets/游戏组-slide-4.jpeg"], "videos": [], "files": [{"label": "成果汇报 PPT", "path": "../游戏组/驰界回响项目汇报.pptx"}, {"label": "项目报告", "path": "../游戏组/游戏组-小学期实训报告.docx"}, {"label": "项目工程压缩包", "path": "../游戏组/完整联机功能.zip"}], "accent": "orange"}];

const CATEGORY_COVERS = {
  hardware: ['assets/hardware-1.jpg', 'assets/hardware-2.jpg', 'assets/hardware-3.jpg'],
  software: ['assets/software-1.jpg', 'assets/software-2.jpg', 'assets/software-3.jpg'],
  game: ['assets/game-1.jpg', 'assets/game-2.jpg']
};

function cardCover(project, list) {
  const covers = CATEGORY_COVERS[project.category] || [];
  const sameCategory = list.filter(item => item.category === project.category);
  const index = Math.max(0, sameCategory.findIndex(item => item.id === project.id));
  return covers[index % covers.length] || project.media?.[0] || '';
}

const icon = {
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>'
};

const state = { filter: 'all', query: '' };
const grid = document.querySelector('#projectGrid');
const modal = document.querySelector('#detailModal');
const modalBody = document.querySelector('#modalBody');
const statProjects = document.querySelector('#statProjects');
const statTracks = document.querySelector('#statTracks');
const statVideos = document.querySelector('#statVideos');
const statDocs = document.querySelector('#statDocs');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function encodePath(value = '') { return encodeURI(value).replace(/#/g, '%23'); }
function categoryClass(category) { return category === 'hardware' ? 'hardware' : category === 'software' ? 'software' : 'game'; }

function filteredProjects() {
  const q = state.query.trim().toLowerCase();
  return PROJECTS.filter(p => {
    const inFilter = state.filter === 'all' || p.category === state.filter;
    const hay = [p.group, p.title, p.subtitle, p.summary, ...(p.tags || []), ...(p.tech || [])].join(' ').toLowerCase();
    return inFilter && (!q || hay.includes(q));
  });
}

function renderStats() {
  const videoCount = PROJECTS.reduce((n,p) => n + (p.videos || []).length, 0);
  const fileCount = PROJECTS.reduce((n,p) => n + (p.files || []).length, 0);
  statProjects.textContent = PROJECTS.length;
  statTracks.textContent = new Set(PROJECTS.map(p => p.category)).size;
  statVideos.textContent = videoCount;
  statDocs.textContent = fileCount;
}

function renderCards() {
  const list = filteredProjects();
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state"><strong>没有找到匹配成果</strong><span>试试搜索“CAN”“小车”“Unity”或切换分类。</span></div>';
    return;
  }
  grid.innerHTML = list.map((p, index) => {
    const hero = cardCover(p, list);
    return `<article class="project-card reveal" style="--delay:${index * 60}ms">
      <div class="card-media">
        <img src="${encodePath(hero)}" alt="${escapeHtml(p.title)}成果图" loading="lazy">
        <div class="media-overlay"><span>${escapeHtml(p.group)}</span><button class="icon-btn js-open" data-id="${p.id}" aria-label="查看 ${escapeHtml(p.title)}">${icon.arrow}</button></div>
      </div>
      <div class="card-content">
        <div class="eyebrow-row"><span class="eyebrow ${categoryClass(p.category)}">${escapeHtml(p.categoryLabel)}</span><span class="index">0${index + 1}</span></div>
        <h3>${escapeHtml(p.title)}</h3>
        <p class="card-subtitle">${escapeHtml(p.subtitle)}</p>
        <p class="card-summary">${escapeHtml(p.summary)}</p>
        <div class="tag-row">${p.tags.slice(0,4).map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>
        <button class="text-btn js-open" data-id="${p.id}">查看项目详情 ${icon.arrow}</button>
      </div>
    </article>`;
  }).join('');
  grid.querySelectorAll('.js-open').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.id)));
  setupReveal();
}

function openModal(id) {
  const p = PROJECTS.find(x => x.id === id);
  if (!p) return;
  const gallery = (p.media || []).map((src, i) => `<img src="${encodePath(src)}" alt="${escapeHtml(p.title)}图${i+1}" loading="lazy">`).join('');
  const videos = (p.videos || []).length ? `<section class="modal-section"><div class="section-kicker">演示视频</div><div class="video-grid">${p.videos.map(v => `<div class="video-card"><video controls preload="metadata" poster="${encodePath(p.media?.[0] || '')}" src="${encodePath(v.path)}"></video><span>${escapeHtml(v.label)}</span></div>`).join('')}</div></section>` : '';
  const files = (p.files || []).length ? `<section class="modal-section"><div class="section-kicker">资料索引</div><div class="file-list">${p.files.map(f => `<a href="${encodePath(f.path)}" target="_blank" rel="noopener"><span>${escapeHtml(f.label)}</span>${icon.arrow}</a>`).join('')}</div></section>` : '';
  modalBody.innerHTML = `<div class="modal-hero ${categoryClass(p.category)}"><div><span class="eyebrow">${escapeHtml(p.group)} · ${escapeHtml(p.categoryLabel)}</span><h2>${escapeHtml(p.title)}</h2><p>${escapeHtml(p.subtitle)}</p></div><div class="modal-orbit"><span></span><span></span><span></span></div></div>
    <div class="modal-main"><div class="modal-copy"><p class="lead">${escapeHtml(p.summary)}</p><div class="modal-columns"><section><div class="section-kicker">完成亮点</div><ul class="check-list">${p.highlights.map(x => `<li>${icon.check}<span>${escapeHtml(x)}</span></li>`).join('')}</ul></section><section><div class="section-kicker">技术栈</div><div class="tech-stack">${p.tech.map(x => `<span>${escapeHtml(x)}</span>`).join('')}</div><div class="section-kicker outcome-kicker">可见成果</div><div class="outcome-row">${p.outcomes.map(x => `<span>${escapeHtml(x)}</span>`).join('')}</div></section></div><p class="members">参与同学：${escapeHtml(p.members)}</p></div><div class="modal-gallery">${gallery}</div>${videos}${files}</div>`;
  modal.classList.add('is-open');
  document.body.classList.add('modal-open');
  modal.querySelector('.modal-close').focus();
}
function closeModal() { modal.classList.remove('is-open'); document.body.classList.remove('modal-open'); modalBody.innerHTML = ''; }

function setupFilters() {
  document.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('is-active', x === btn));
    renderCards();
  }));
  document.querySelector('#searchInput').addEventListener('input', e => { state.query = e.target.value; renderCards(); });
}
function setupNav() {
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const el = document.querySelector(a.getAttribute('href'));
    if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }));
}
function setupModal() {
  document.querySelector('.modal-close').addEventListener('click', closeModal);
  document.querySelector('.modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal(); });
}
function setupReveal() {
  if (!('IntersectionObserver' in window)) { document.querySelectorAll('.reveal, .section-reveal').forEach(el => el.classList.add('is-visible')); return; }
  const io = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('is-visible'); }), { threshold: .12 });
  document.querySelectorAll('.reveal, .section-reveal').forEach(el => io.observe(el));
}

renderStats(); renderCards(); setupFilters(); setupNav(); setupModal(); setupReveal();
