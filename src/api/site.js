import * as nodeSite from './site-node.js'
import * as platform from './platform.js'

const usePocketBase = String(import.meta.env.VITE_PLATFORM_BACKEND || 'node').trim().toLowerCase() === 'pocketbase'

export const fetchSite = usePocketBase ? platform.getSiteContent : nodeSite.fetchSite
