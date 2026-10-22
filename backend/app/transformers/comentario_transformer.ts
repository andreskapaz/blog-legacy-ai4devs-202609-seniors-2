import { BaseTransformer } from '@adonisjs/core/transformers'
import type Comentario from '#models/comentario'

/**
 * La fila completa, con los nombres de columna, tal como la devolvía el endpoint.
 * BUG (auditoría 1/16): incluye `autor_email`, `estado` y `post_id`; se mantiene hasta
 * que se decida qué campos salen.
 */
export default class ComentarioTransformer extends BaseTransformer<Comentario> {
  toObject() {
    return {
      id: this.resource.id,
      post_id: this.resource.postId,
      autor_nombre: this.resource.autorNombre,
      autor_email: this.resource.autorEmail,
      cuerpo: this.resource.cuerpo,
      estado: this.resource.estado,
      creado_en: this.resource.creadoEn?.toFormat('yyyy-MM-dd HH:mm:ss') ?? null,
      padre_id: this.resource.padreId,
    }
  }
}
