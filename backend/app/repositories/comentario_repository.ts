import db from '@adonisjs/lucid/services/db'
import Comentario from '#models/comentario'

type NuevoComentario = Pick<
  Comentario,
  'postId' | 'autorNombre' | 'autorEmail' | 'cuerpo' | 'estado' | 'creadoEn' | 'padreId'
>

export class ComentarioRepository {
  async idDePostPublicado(slug: string): Promise<number | null> {
    const post = await db
      .from('posts')
      .select('id')
      .where('slug', slug)
      .where('estado', 'publicado')
      .first()
    return post ? post.id : null
  }

  buscar(id: number | string) {
    return Comentario.find(id)
  }

  /**
   * Inserta y devuelve la última fila de la tabla, no la insertada: es lo que hace hoy el
   * endpoint (auditoría 5) y se mantiene hasta que se decida corregirlo.
   */
  async crear(datos: NuevoComentario) {
    await Comentario.create(datos)
    return Comentario.query().orderBy('id', 'desc').firstOrFail()
  }

  async actualizarCuerpo(comentario: Comentario, cuerpo: string) {
    comentario.cuerpo = cuerpo
    await comentario.save()
    await comentario.refresh()
    return comentario
  }

  borrar(comentario: Comentario) {
    return comentario.delete()
  }
}
