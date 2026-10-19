import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'
import AboutPage from '../views/AboutPage.vue'
import ProjectsPage from '../views/ProjectsPage.vue'
import ServicesPage from '../views/ServicesPage.vue'
import ResourceLibraryPage from '../views/ResourceLibraryPage.vue'
import LabTeamPage from '../views/LabTeamPage.vue'
import PortalPage from '../views/PortalPage.vue'
import MemberPage from '../views/MemberPage.vue'
import AdminPage from '../views/AdminPage.vue'
import AnnouncementsPage from '../views/AnnouncementsPage.vue'
import { getMe } from '../api/platform'

const routes = [
  { path: '/assignments', component: () => import('../views/AssignmentsPage.vue') },
  { path: '/teams/:id(software|hardware|simulation)', component: LabTeamPage },
  { path: '/portal', component: PortalPage },
  { path: '/member', component: MemberPage, meta: { requiresAuth: true } },
  { path: '/admin', component: AdminPage, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/announcements', component: AnnouncementsPage },
  { path: '/announcements/:slug', component: AnnouncementsPage },
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

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  try {
    const user = (await getMe())?.data
    if (!user) {
      return { path: '/portal', query: { mode: 'login', redirect: to.fullPath } }
    }
    if (to.meta.requiresAdmin && user.role !== 'admin') {
      return { path: '/member' }
    }
  } catch {
    return { path: '/portal', query: { mode: 'login', redirect: to.fullPath } }
  }

  return true
})

export default router
