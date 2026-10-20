export const defaultTeams = [
  { id: 'software', name: '软件团队', caption: '让车辆数据变成可用体验', image: '/projects/xiaoxueqi-2026/photos/软件1.png', intro: '从车载应用、数据链路到机器视觉，把车辆状态与感知结果转化为清晰、可靠的交互体验。', learn: ['Android 与车载应用开发', 'CAN 数据读取与状态展示', '视觉感知与主动安全交互'], practice: '从界面、数据或算法中的一个小模块开始，逐步拼出完整的车载系统。' },
  { id: 'hardware', name: '硬件团队', caption: '让控制策略落到真实设备', image: '/projects/xiaoxueqi-2026/photos/硬件1.png', intro: '围绕单片机、传感器、电机和智能小车，完成从电路连接、底层驱动到整车联调的工程实践。', learn: ['单片机与外设接口', '传感器采集和电机驱动', '运动控制与整车调试'], practice: '把线路接通、让电机转起来，再通过持续测试让设备稳定完成任务。' },
  { id: 'simulation', name: '游戏 / 仿真团队', caption: '在交互场景中验证与表达', image: '/projects/xiaoxueqi-2026/photos/游戏1.png', intro: '用车辆仿真、游戏引擎和交互设计搭建可体验的驾驶场景，让控制与座舱想法变成可玩的作品。', learn: ['Unity 场景与交互开发', '车辆控制与驾驶仿真', '多人协作与体验设计'], practice: '从驾驶输入、画面反馈或多人联机中的一个体验细节开始，逐步搭建完整场景。' },
]
export const teams = defaultTeams
export const teamName = id => defaultTeams.find(team => team.id === id)?.name || id
