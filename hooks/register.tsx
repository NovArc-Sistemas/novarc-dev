// The novarc-dev plugin's hooks module: only the Maestro mod (execution band, /maestro, milestone hooks).
import type { Register } from 'claude-code'

import { registerMaestro } from './maestro/register'

export const register: Register = (on, options) => {
  registerMaestro(on, options)
}
