export const siteContent = {
  brand: {
    name: 'combinilen Hub',
    tagline: 'Company Profile',
    email: 'anvapilot@combinilen.hub',
    phone: '028-0000-0000',
    address: '成都东软学院 智能网联汽车实验室',
  },
  navigation: [
    { path: '/', label: 'Home' },
    { path: '/about', label: 'About Us' },
    { path: '/projects', label: 'Projects' },
    { path: '/services', label: 'Services' },
    { path: '/team', label: 'Team' },
    { path: '/contact', label: 'Contact' },
  ],
  footer: {
    links: [
      { label: 'Contact', path: '/contact' },
      { label: 'Projects', path: '/projects' },
      { label: 'Services', path: '/services' },
    ],
    socials: [
      { label: 'GitHub', href: 'https://github.com' },
      { label: 'Instagram', href: 'https://www.instagram.com' },
      { label: 'Twitter', href: 'https://x.com' },
    ],
  },
  home: {
    hero: {
      title: '智能网联汽车实验室',
      subtitle:
        '本实验室面向新工科人才培养，围绕智能汽车、车路协同、车载嵌入式、机器视觉感知开展教学与科研工作，服务物联网工程、车辆工程等专业。实验室配备鸿蒙智驾小车、视觉采集套件、仿真工作站等实训设备，承接小学期综合实训、课程设计、大创项目以及各类学科竞赛任务。实现硬件开发、软件编程、算法调测一体化实践，学生可完成智能小车控制、传感器采集、上下位机联动、图像识别等完整项目开发，产出实训作品、软件著作权与竞赛成果，重点开展车载嵌入式小车控制、机器视觉环境感知、车路协同通信、仿真算法验证等方向的实践研究。',
      image: '/picture1.png',
      imageAlt: 'Company profile hero image',
    },
    featuredProjects: [
      {
        name: '鸿蒙智驾小车控制系统',
        category: '嵌入式实训项目',
        summary: '基于鸿蒙Hi3861主控板开发，实现小车运动控制、传感器数据采集、上位机指令交互，完成小车前进后退、转向以及传感器数据回传等功能。',
      },
      {
        name: '果实成熟度视觉检测系统',
        category: '机器视觉项目',
        summary: '依托OpenCV图像处理技术，完成图像预处理、颜色特征提取、目标轮廓识别，实现对果实成熟度的识别判断。',
      },
      {
        name: '车路协同仿真验证平台',
        category: '算法仿真项目',
        summary: '用于智能小车路径规划、运动控制算法验证，降低实物硬件调试成本，支撑智能网联相关算法学习与调试。',
      },
    ],
    teamHighlights: [
     { name: 'Software Group', role: '负责软件代码开发、上位机程序、机器视觉算法实现' },
      { name: 'Hardware Group', role: '负责硬件调试、智驾小车硬件装配、传感器驱动开发' },
      { name: 'Game Group', role: '负责仿真交互、虚拟场景搭建、可视化界面开发' },
      { name: 'Media Group', role: '负责文档整理、项目素材、网页与展示内容制作' },
    ],
    services: [
      { title: "Embedded Development", summary: "鸿蒙嵌入式开发、智驾小车硬件驱动与控制程序开发" },
      { title: "Machine Vision", summary: "OpenCV图像处理、目标检测、物体识别算法原型开发" },
      { title: "System Simulation", summary: "智能网联仿真、路径规划算法验证、交互上位机开发" },
      { title: "Project Practice", summary: "大创项目、学科竞赛、软件著作权申报等项目实践指导" },
    ],
  },
  about: {
    hero: {
      title: 'MEET OUR INSTRUCTORS',
      subtitle:
        'A compact team focused on student projects, practical iteration, and clear ownership.',
    },
    story: [
  '智能网联汽车实验室立足于新工科创新人才培养，聚焦车载嵌入式开发、智能小车控制、机器视觉感知与车路协同仿真技术，持续开展教学实训、项目研发与学科竞赛指导工作。',
  '实验室坚持理论与实践深度融合，依托鸿蒙智驾硬件平台与机器视觉算法环境，让学生从硬件装配、程序开发、算法调试到项目落地完成全流程实战训练。',
  '以真实项目为驱动，以竞赛创新为导向，不断积累科研实训成果，打造可落地、可展示、可迭代的智能汽车实训创新平台。',
],
mission: [
  '深耕智能网联汽车、嵌入式开发、机器视觉领域教学研究，完善专业实训教学体系，补齐学生工程实践短板。',
  '搭建软硬件一体化、学赛研一体化的创新实训平台，依托智驾小车、视觉仿真等设备，为学生提供全方位的项目开发环境。',
  '持续培育高素质新工科技术人才，引导学生参与创新创业项目、学科竞赛与科研实践，提升学生创新能力与工程落地能力。',
],
values: ['务实实践', '技术融合', '创新探索', '协同共进'],
advisors: [
  { name: '王老师', role: '嵌入式与智能网联指，机器视觉算法指，项目与竞赛指导' },
],
achievements: [
  '搭建鸿蒙智驾小车综合实训平台。',
  '完成果实成熟度视觉检测系统开发。',
  '实现实验室官网前后端完整项目。',
  '累计支撑多项学生大创与竞赛项目。',
],

  },
  projects: {
    hero: {
      title: 'Selected Projects',
      subtitle: 'A small set of work samples that show the team\'s range and delivery style.',
    },
    items: [
      {
        name: 'Campus Assistant',
        category: 'Mini Program',
        summary: 'Campus notices, service shortcuts, and student-facing utility features.',
        stack: ['Vue', 'WeChat', 'UI'],
      },
      {
        name: 'Startup Website',
        category: 'Company Website',
        summary: 'A responsive homepage and multi-section information architecture.',
        stack: ['Vue 3', 'Vite', 'Router'],
      },
      {
        name: 'AI Chatbot',
        category: 'Prototype',
        summary: 'A simple conversation layer for product demos and knowledge lookup.',
        stack: ['API', 'UX', 'AI'],
      },
      {
        name: 'Team Profile System',
        category: 'Internal Tool',
        summary: 'A lightweight profile site with shared content and contact submission flows.',
        stack: ['Pinia', 'Node', 'Vite'],
      },
    ],
  },
  services: {
  hero: {
    title: "加入我们，开启技术实践之旅",
    subtitle: "在这里学习、动手、竞赛、成长",
  },
  specialties: [
    {
      title: "嵌入式硬件实践",
      summary: "学习STM32、鸿蒙智驾小车开发，掌握传感器、电机驱动、硬件调试，亲手搭建智能硬件项目。",
    },
    {
      title: "软件算法实践",
      summary: "学习OpenCV图像处理、目标检测，完成图像识别、目标定位等算法原型，锻炼AI工程能力。",
    },
    {
      title: "仿真与上位机开发",
      summary: "接触智能车辆仿真环境，学习路径规划，开发交互上位机，打通算法与可视化交互。",
    },
    {
      title: "综合项目实战",
      summary: "参与大创项目、学科竞赛、软件著作权申报，完成网页、系统等成果产出，积累完整项目履历。",
    },
  ],
  largeModel: {
    title: "LARGE MODEL APPLICATIONS",
    subtitle: "大模型与智能车载融合实践",
    intro: "探索大模型在智能车辆场景下的落地，结合机器视觉、嵌入式硬件完成AI原型开发，参与真实AI应用项目。",
    items: [
      {
        title: "车载视觉大模型",
        summary: "结合大模型完成图像理解、场景识别，实现目标检测、环境感知，赋能智驾小车环境认知能力。",
      },
      {
        title: "多模态交互原型",
        summary: "搭建语音、文本、图像多模态交互demo，实现小车语音指令控制、场景问答交互。",
      },
      {
        title: "模型轻量化部署",
        summary: "将训练后的AI模型做裁剪优化，部署到嵌入式设备，完成端侧AI推理实战。",
      },
      {
        title: "AI应用创新项目",
        summary: "基于大模型开发竞赛课题、大创项目，产出演示系统、演示网页，积累AI工程实践经历。",
      },
    ],
    learningOutcome: [
      "掌握大模型调用、Prompt工程基础",
      "学习AI模型向嵌入式端移植部署流程",
      "完成多模态AI项目原型，丰富竞赛简历",
    ],
  },
  
  process: ["入营学习", "基础训练", "项目分组", "迭代开发", "成果输出"],
  testimonials: [
    "从零基础入门，逐步成长为可以独立完成模块开发的实验室成员。",
    "竞赛、大创、专利软著，把课堂知识转化为看得见的成果。",
  ],
},

  team: {
    hero: {
      title: 'Team Members',
      subtitle: 'People who carry the layout, content, and implementation work together.',
    },
    members: [
      { name: '王维宇', role: '指导老师', bio: '统筹项目方向、方案评审，提供技术指导' },
      { name: 'Zinnia Yara', role: '实验室负责人', bio: '负责实验室日常管理，统筹项目整体规划与任务分配工作。' },
      { name: '黄智雄', role: '硬件组', bio: '负责硬件电路设计、外设驱动调试，完成硬件平台搭建。' },
      { name: '余俊虎', role: '软件组', bio: '负责前后端程序开发，完成业务逻辑编写与功能模块实现。' },
      { name: '李欣玥', role: '实验室负责人', bio: '协调组内分工，跟进项目进度，保障项目按计划推进落地。' },
      { name: '赵泽增', role: '游戏组', bio: '负责交互原型开发，完成功能测试，校验项目整体可用性。' },
    ],
    join: {
      title: 'Join Our Team',
      summary: '欢迎热爱软硬件开发的同学加入本实验室。团队开放硬件开发、软件前后端、算法实现等岗位，在这里可以参与真实项目，积累工程实践经验。期待积极主动、乐于交流的你一起成长。',
    },
    life: ['每周项目例会', '阶段成果演示', '多人协同开发', '版本迭代记录'],
  },
  contact: {
    hero: {
      title: 'Contact',
      subtitle: 'Leave a message or submit a recruitment intent directly from the site.',
    },
    channels: [
      { label: 'Email', value: 'anvapilot@combinilen.hub' },
      { label: 'Phone', value: '028-0000-0000' },
      { label: 'Address', value: '成都东软学院 智能网联汽车实验室' },
    ],
    note: 'Recruitment intent is tracked separately from contact messages.',
  },
}

export const contactSubmissions = []
export const recruitmentSubmissions = []



