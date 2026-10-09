export const teams = [
  { id: 'software', name: '软件团队', caption: '让设备真正“会思考”', image: '/picture7.png', intro: '从网页与上位机到机器视觉、数据处理和车辆控制逻辑，把想法写成能运行的系统。', learn: ['编程与版本管理', '上位机和 Web 应用', '视觉感知与数据处理'], practice: '适合喜欢编程、想从小功能逐步做出完整项目的同学。' },
  { id: 'hardware', name: '硬件团队', caption: '让想法落到真实设备', image: '/picture6.png', intro: '接触单片机、传感器、控制板和智能小车，从接线、调试到软硬件联动。', learn: ['单片机与接口基础', '传感器和电机驱动', '电路连接与故障排查'], practice: '适合喜欢动手、愿意拆解问题并反复调试的同学。' },
  { id: 'simulation', name: '游戏 / 仿真团队', caption: '在虚拟环境中验证真实问题', image: '/picture7.png', intro: '搭建交互场景和车辆仿真，设计操作体验，验证控制策略并展示实验成果。', learn: ['交互场景搭建', '车辆与驾驶仿真', '可视化和体验设计'], practice: '适合对游戏制作、三维交互或仿真验证感兴趣的同学。' },
]
export const teamName = id => teams.find(team => team.id === id)?.name || id
