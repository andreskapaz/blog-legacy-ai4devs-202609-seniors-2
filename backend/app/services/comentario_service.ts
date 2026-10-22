import { inject } from '@adonisjs/core'
import { DateTime } from 'luxon'
import type Comentario from '#models/comentario'
import ErrorDeContratoException from '#exceptions/error_de_contrato_exception'
import { ComentarioRepository } from '#repositories/comentario_repository'
import type { Infer } from '@vinejs/vine/types'
import type { crearComentarioValidator } from '#validators/comentario'

/**
 * Clave que valida las acciones de moderación. Sigue escrita en el código, como antes del
 * refactor (auditoría 4). TODO(2024-11): sacarla a variables de entorno.
 */
const CLAVE_MODERACION = 'dev-secret-cambiar'

type Autoria = Pick<Comentario, 'autorEmail' | 'estado'>

/**
 * Puede borrar quien lo escribió (el email se compara sin mayúsculas ni espacios) o
 * cualquiera que traiga la clave de moderación.
 */
export function puedeBorrar(
  comentario: Autoria,
  credenciales: { email?: unknown; clave?: unknown }
) {
  const esModerador = credenciales.clave === CLAVE_MODERACION
  const esAutor =
    String(comentario.autorEmail).toLowerCase().trim() ===
    String(credenciales.email ?? '')
      .toLowerCase()
      .trim()
  return esModerador || esAutor
}

/**
 * Puede editar solo quien lo escribió, con el email exacto, y solo mientras está pendiente.
 * Contradice a `puedeBorrar` (auditoría 13): se mantiene así hasta que se decida unificarlas.
 */
export function puedeEditar(comentario: Autoria, email: unknown) {
  return comentario.autorEmail === email && comentario.estado === 'pendiente'
}

@inject()
export class ComentarioService {
  constructor(private repositorio: ComentarioRepository) {}

  async idDePostPublicado(slug: string) {
    const postId = await this.repositorio.idDePostPublicado(slug)
    if (postId === null) {
      throw new ErrorDeContratoException({ error: 'Post no encontrado' }, 404)
    }
    return postId
  }

  crear(postId: number, datos: Infer<typeof crearComentarioValidator>) {
    return this.repositorio.crear({
      postId,
      autorNombre: datos.autor_nombre,
      autorEmail: datos.autor_email,
      cuerpo: datos.cuerpo,
      estado: 'pendiente',
      creadoEn: DateTime.utc().startOf('second'),
      padreId: datos.padre_id ?? null,
    })
  }

  async borrar(id: number | string, credenciales: { email?: unknown; clave?: unknown }) {
    const comentario = await this.#buscar(id)
    if (!puedeBorrar(comentario, credenciales)) {
      throw new ErrorDeContratoException({ error: 'No puedes borrar este comentario' }, 403)
    }
    await this.repositorio.borrar(comentario)
    return comentario
  }

  async editable(id: number | string, email: unknown) {
    const comentario = await this.#buscar(id)
    if (!puedeEditar(comentario, email ?? '')) {
      throw new ErrorDeContratoException({ error: 'No puedes editar este comentario' }, 403)
    }
    return comentario
  }

  editar(comentario: Comentario, cuerpo: string) {
    return this.repositorio.actualizarCuerpo(comentario, cuerpo)
  }

  async #buscar(id: number | string) {
    const comentario = await this.repositorio.buscar(id)
    if (!comentario) {
      throw new ErrorDeContratoException({ error: 'Comentario no encontrado' }, 404)
    }
    return comentario
  }
}
