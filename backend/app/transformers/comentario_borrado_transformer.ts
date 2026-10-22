import { BaseTransformer } from '@adonisjs/core/transformers'
import type Comentario from '#models/comentario'

export default class ComentarioBorradoTransformer extends BaseTransformer<Comentario> {
  toObject() {
    return { borrado: true }
  }
}
