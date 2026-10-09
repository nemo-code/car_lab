import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'
import AboutPage from '../views/AboutPage.vue'
import ProjectsPage from '../views/ProjectsPage.vue'
import ServicesPage from '../views/ServicesPage.vue'
import ResourceLibraryPage from '../views/ResourceLibraryPage.vue'
import LabTeamPage from '../views/LabTeamPage.vue'
import PortalPage from '../views/PortalPage.vue'

const routes = [
  { path: '/teams/:id(software|hardware|simulation)', component: LabTeamPage },
  { path: '/portal', component: PortalPage },
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
    path: '/resources',
    alias: '/Resources',
    name: 'resources',
    component: ResourceLibraryPage,
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
    redirect: '/teams/software',
  },
  {
    path: '/contact',
    alias: '/Contact',
    redirect: '/portal?mode=apply',
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
