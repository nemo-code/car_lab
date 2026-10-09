<template>
  <div class="lab-home">
    <section class="lab-hero">
      <img src="/picture6.png" alt="智能车辆、感知设备与实验人员组成的实验场景" />
      <div class="lab-hero-shade"></div>
      <div class="lab-wrap lab-hero-content">
        <span class="lab-eyebrow">智能网联汽车实验室</span>
        <h1>从第一行代码，到一辆能跑的车</h1>
        <p>在这里，软件、硬件与仿真团队一起完成智能车辆项目。无论你刚接触专业，还是已经有一个想验证的点子，都能找到可参与的起点。</p>
        <div class="lab-actions"><a class="lab-primary" href="#directions">探索团队</a><router-link class="lab-ghost" to="/portal?mode=apply">申请加入</router-link></div>
      </div>
    </section>
    <section class="lab-wrap lab-section" id="directions">
      <div class="lab-heading"><span class="lab-eyebrow">选择你的方向</span><h2>三个团队，一起完成一件事</h2><p>先看看自己感兴趣的环节。你不需要在加入前就掌握所有技能。</p></div>
      <div class="lab-teams">
        <router-link v-for="team in teams" :key="team.id" :to="`/teams/${team.id}`" class="lab-team">
          <img :src="team.image" :alt="team.name + '方向示意'" />
          <div><span>{{ team.caption }}</span><h3>{{ team.name }}</h3><p>{{ team.intro }}</p><strong>了解团队 →</strong></div>
        </router-link>
      </div>
    </section>
    <section class="lab-band"><div class="lab-wrap lab-band-inner"><div><span class="lab-eyebrow">实践从这里开始</span><h2>看项目，做项目，留下可复用的成果</h2><p>从智能小车控制、传感器采集到图像识别和车辆仿真，实验室将课堂知识串成可运行、可展示的作品。</p></div><router-link class="lab-primary" to="/projects">查看项目</router-link></div></section>
    <section class="lab-wrap lab-section lab-join"><div><span class="lab-eyebrow">加入流程</span><h2>找到方向，然后开始</h2></div><ol><li>浏览团队与公开资源</li><li>选择方向并提交申请</li><li>管理员审核，登录查看结果</li><li>通过后查看所属团队内部资源</li></ol><router-link class="lab-primary" to="/portal?mode=apply">提交申请</router-link></section>
  </div>
</template>
<script setup>
import { teams } from '../lab'
</script>
