#!/usr/bin/env node
/**
 * Hook PreToolUse (matcher: Bash). Hace cumplir la Definition of Done de CLAUDE.md.
 *
 *   git commit  → bloqueado si la suite de Japa no está verde.
 *
 * Esto es APLICACIÓN, no consejo: CLAUDE.md pide, esto garantiza.
 *
 * ⚠️ Engancha la HERRAMIENTA Bash, no el hook `pre-commit` de git. Por eso también atrapa
 *    `git commit --no-verify`: el comando ni siquiera llega a ejecutarse.
 *
 * Montado en .claude/settings.json. Bloquea saliendo con código 2 y el motivo por stderr,
 * que es lo que Claude Code devuelve al agente para que lo lea y reaccione.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Umbral de cobertura de línea que hay que superar para poder commitear.
 *
 * ⚠️ HOY VALE 0 A PROPÓSITO. El proyecto arranca con UN SOLO test (el camino feliz de crear
 * un comentario), así que cualquier umbral real bloquearía el primer commit del primer día y
 * lo primero que haría alguien es apagar el hook — y un hook apagado no protege nada.
 *
 * Con 0, el hook solo exige suite verde y ni siquiera calcula la cobertura (medirla cuesta
 * segundos y no aporta si no bloquea). Súbelo conforme la suite crezca: 40 tras caracterizar
 * el primer recurso, 60 tras el segundo, 80 como destino. Al ponerlo > 0 el hook empieza a
 * correr `npm run test:coverage` y a leer backend/coverage/coverage-summary.json.
 */
const COBERTURA_MINIMA = 40

// El comando que el modelo quiere ejecutar llega como JSON por stdin, en tool_input.command.
let comando = ''
try {
  comando = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command ?? ''
} catch {
  process.exit(0) // payload ilegible → no estorbamos
}

if (!/\bgit\s+commit\b/.test(comando)) {
  process.exit(0) // cualquier otro comando pasa intacto
}

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const backend = resolve(raiz, 'backend')

function bloquear(detalle) {
  process.stderr.write('\n⛔ Bloqueado: para commitear, la suite tiene que estar verde.\n')
  process.stderr.write('   (TDD: rojo → verde → refactor. Arregla y reintenta.)\n')
  process.stderr.write('   Si falla por entorno y no por código: `make setup && make db`.\n\n')
  process.stderr.write(`${detalle}\n`)
  process.exit(2) // código 2 → bloquea la llamada y devuelve stderr al agente
}

// 1. La suite tiene que estar verde.
try {
  execSync('npm test', { cwd: backend, stdio: 'pipe' })
} catch (err) {
  const salida = `${err.stdout?.toString() ?? ''}${err.stderr?.toString() ?? ''}`.trim()
  bloquear(salida.split('\n').slice(-30).join('\n') || 'La suite de tests ha fallado.')
}

// 2. Y, si alguien ha subido el umbral, la cobertura de línea tiene que superarlo.
if (COBERTURA_MINIMA > 0) {
  let porcentaje = 0
  try {
    execSync('npm run test:coverage', { cwd: backend, stdio: 'pipe' })
    const resumen = JSON.parse(
      readFileSync(resolve(backend, 'coverage/coverage-summary.json'), 'utf8')
    )
    porcentaje = resumen.total.lines.pct
  } catch {
    bloquear(
      'No he podido leer backend/coverage/coverage-summary.json. Corre `make test-coverage`.'
    )
  }
  if (porcentaje < COBERTURA_MINIMA) {
    bloquear(
      `Cobertura de línea: ${porcentaje}% (hace falta ≥ ${COBERTURA_MINIMA}%).\n` +
        'Cubre lo que falta de la matriz: entrada inválida, 404 y la frontera de la regla de negocio.'
    )
  }
}

process.exit(0)
