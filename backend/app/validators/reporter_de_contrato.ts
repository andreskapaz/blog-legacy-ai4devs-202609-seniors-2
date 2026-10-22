import { ValidationError } from '@vinejs/vine'
import type { ErrorReporterContract, FieldContext } from '@vinejs/vine/types'

export type RespuestaDeError = { status: number; cuerpo: Record<string, unknown> }

/**
 * Error de validación que ya sabe con qué código y qué cuerpo se responde.
 * Se renderiza en app/exceptions/handler.ts.
 */
export class ValidacionDeContratoError extends ValidationError {
  constructor(readonly respuesta: RespuestaDeError) {
    super([respuesta.cuerpo])
    this.status = respuesta.status
  }
}

/**
 * Reporter de VineJS que responde con el PRIMER error encontrado, traducido a la forma
 * que el contrato de cada endpoint tiene hoy (código y cuerpo distintos por campo y regla).
 */
class ReporterDeContrato implements ErrorReporterContract {
  hasErrors = false
  #primero?: RespuestaDeError

  constructor(private traducir: (campo: string, regla: string) => RespuestaDeError) {}

  report(_mensaje: string, regla: string, campo: FieldContext) {
    this.hasErrors = true
    this.#primero ??= this.traducir(campo.getFieldPath(), regla)
  }

  createError() {
    return new ValidacionDeContratoError(this.#primero!)
  }
}

export function reportarComo(traducir: (campo: string, regla: string) => RespuestaDeError) {
  return () => new ReporterDeContrato(traducir)
}
