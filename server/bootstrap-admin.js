import { createAdmin } from './platform.js'

const [email, name = 'Lab administrator'] = process.argv.slice(2)
let password = ''
for await (const chunk of process.stdin) password += chunk
createAdmin(email, name, password.trimEnd())
console.log('Administrator created')
