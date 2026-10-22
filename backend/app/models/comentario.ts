import { ComentarioSchema } from '#database/schema'

export default class Comentario extends ComentarioSchema {
  static table = 'comentarios'
}
