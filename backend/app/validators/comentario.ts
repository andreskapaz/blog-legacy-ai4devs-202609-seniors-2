import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'
import { reportarComo } from '#validators/reporter_de_contrato'

/**
 * Reglas tal como las aplica hoy la API. «Presente» significa «truthy», sin mirar el tipo,
 * y la longitud se mide sobre `String(valor)`.
 */
const presente = vine.createRule((valor: unknown, _opciones: undefined, campo: FieldContext) => {
  if (!valor) campo.report('El campo {{ field }} es obligatorio', 'presente', campo)
})

const conArroba = vine.createRule((valor: unknown, _opciones: undefined, campo: FieldContext) => {
  if (String(valor).indexOf('@') === -1) {
    campo.report('El campo {{ field }} no es un email', 'conArroba', campo)
  }
})

const largoMinimo = vine.createRule((valor: unknown, minimo: number, campo: FieldContext) => {
  if (String(valor).length < minimo) {
    campo.report('El campo {{ field }} es demasiado corto', 'largoMinimo', campo)
  }
})

/**
 * Datos para dejar un comentario en un post
 */
export const crearComentarioValidator = vine.create({
  autor_nombre: vine.any().use(presente()),
  autor_email: vine.any().use(presente()).use(conArroba()),
  cuerpo: vine.any().use(presente()).use(largoMinimo(5)),
  padre_id: vine.any().optional(),
})

crearComentarioValidator.errorReporter = reportarComo((campo, regla) => {
  if (campo === 'autor_nombre') {
    return { status: 400, cuerpo: { error: 'El nombre es obligatorio' } }
  }
  if (campo === 'autor_email' && regla === 'conArroba') {
    return { status: 400, cuerpo: { errores: ['email no válido'] } }
  }
  if (campo === 'autor_email') {
    return { status: 422, cuerpo: { message: 'Falta el email' } }
  }
  return { status: 200, cuerpo: { ok: false, motivo: 'comentario demasiado corto' } }
})

/**
 * Quién intenta borrar un comentario: email del autor o clave de moderación
 */
export const borrarComentarioValidator = vine.create({
  autor_email: vine.any().optional(),
  headers: vine.object({
    'x-clave-moderacion': vine.any().optional(),
  }),
})

/**
 * Quién intenta editar un comentario
 */
export const autorDeComentarioValidator = vine.create({
  autor_email: vine.any().optional(),
})

/**
 * Nuevo cuerpo de un comentario
 */
export const editarComentarioValidator = vine.create({
  cuerpo: vine.any().use(presente()),
})

editarComentarioValidator.errorReporter = reportarComo(() => ({
  status: 400,
  cuerpo: { error: 'Falta el cuerpo' },
}))
