import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'
import AboutPage from '../views/AboutPage.vue'
import ProjectsPage from '../views/ProjectsPage.vue'
import ContactPage from '../views/ContactPage.vue'
import ServicesPage from '../views/ServicesPage.vue'
import TeamPage from '../views/TeamPage.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
  },
  {
    path: '/about',
    alias: '/About',
    name: 'about',
    component: AboutPage,
  },
  {
    path: '/projects',
    alias: '/Projects',
    name: 'projects',
    component: ProjectsPage,
  },
  {
    path: '/services',
    alias: '/Services',
    name: 'services',
    component: ServicesPage,
  },
  {
    path: '/team',
    alias: '/Team',
    name: 'team',
    component: TeamPage,
  },
  {
    path: '/contact',
    alias: '/Contact',
    name: 'contact',
    component: ContactPage,
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
