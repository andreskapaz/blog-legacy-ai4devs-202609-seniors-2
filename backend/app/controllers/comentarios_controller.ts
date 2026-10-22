import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ComentarioService } from '#services/comentario_service'
import {
  autorDeComentarioValidator,
  borrarComentarioValidator,
  crearComentarioValidator,
  editarComentarioValidator,
} from '#validators/comentario'
import ComentarioTransformer from '#transformers/comentario_transformer'
import ComentarioBorradoTransformer from '#transformers/comentario_borrado_transformer'

@inject()
export default class ComentariosController {
  constructor(private comentarios: ComentarioService) {}

  async store({ params, request, response, serialize }: HttpContext) {
    const postId = await this.comentarios.idDePostPublicado(params.slug)
    const datos = await request.validateUsing(crearComentarioValidator)

    const comentario = await this.comentarios.crear(postId, datos)

    response.status(201)
    return serialize.withoutWrapping({ comentario: ComentarioTransformer.transform(comentario) })
  }

  async update({ params, request, serialize }: HttpContext) {
    const { autor_email: email } = await request.validateUsing(autorDeComentarioValidator)
    const comentario = await this.comentarios.editable(params.id, email)
    const { cuerpo } = await request.validateUsing(editarComentarioValidator)

    const editado = await this.comentarios.editar(comentario, cuerpo)

    return serialize.withoutWrapping({ comentario: ComentarioTransformer.transform(editado) })
  }

  async destroy({ params, request, serialize }: HttpContext) {
    const { autor_email: email, headers } = await request.validateUsing(borrarComentarioValidator)

    const borrado = await this.comentarios.borrar(params.id, {
      email,
      clave: headers['x-clave-moderacion'],
    })

    return serialize.withoutWrapping(ComentarioBorradoTransformer.transform(borrado))
  }
}
