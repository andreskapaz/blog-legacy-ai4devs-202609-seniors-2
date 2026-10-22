import { Exception } from '@adonisjs/core/exceptions'

/**
 * Error que se responde con el código y el cuerpo exactos que el contrato de la API
 * devuelve hoy. Se renderiza en app/exceptions/handler.ts.
 */
export default class ErrorDeContratoException extends Exception {
  constructor(
    readonly cuerpo: Record<string, unknown>,
    status: number
  ) {
    super(JSON.stringify(cuerpo), { status })
  }
}
