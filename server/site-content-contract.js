import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const contract = require('../pocketbase/pb_hooks/site-content-contract.cjs')

export const siteSections = contract.siteSections
export const maxSitePayloadLength = contract.maxPayloadLength
export const validateSiteSection = contract.validateSiteSection
export const validateSitePayload = contract.validateSitePayload
export const validateSitePayloadSize = contract.validateSitePayloadSize
