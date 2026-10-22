import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import testUtils from '@adonisjs/core/services/test_utils'

/**
 * Caracterización de los endpoints de comentarios.
 *
 * Fijan lo que el sistema hace HOY, bugs incluidos. Los marcados con «BUG» documentan un
 * defecto conocido (ver docs/auditoria): si alguien lo corrige, este test tiene que cambiar
 * en esa misma tarea, con su decisión explícita.
 */

const CAMPOS_COMENTARIO = [
  'id',
  'post_id',
  'autor_nombre',
  'autor_email',
  'cuerpo',
  'estado',
  'creado_en',
  'padre_id',
]

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

const CLAVE_MODERACION = 'dev-secret-cambiar'

function unPost(cambios: Record<string, unknown> = {}) {
  return {
    id: 9001,
    titulo: 'Post de prueba',
    slug: 'post-de-prueba',
    resumen: 'Resumen de prueba',
    cuerpo: '## Cuerpo de prueba',
    imagen_portada: null,
    estado: 'publicado',
    publicado_en: '2026-01-01 10:00:00',
    autor_id: 1,
    categoria_id: 1,
    autor_nombre: 'Marta Ruiz Calvo',
    autor_email: 'marta.ruiz@corriente.es',
    categoria_nombre: 'Noticias',
    etiquetas: 'Artículos',
    created_at: '2026-01-01 10:00:00',
    updated_at: '2026-01-01 10:00:00',
    ...cambios,
  }
}

function unComentario(cambios: Record<string, unknown> = {}) {
  return {
    id: 9101,
    post_id: 9001,
    autor_nombre: 'Lucía Ferrer',
    autor_email: 'lucia.ferrer@ejemplo.es',
    cuerpo: 'Un comentario suficientemente largo.',
    estado: 'pendiente',
    creado_en: '2026-01-02 09:30:00',
    padre_id: null,
    ...cambios,
  }
}

function unEnvio(cambios: Record<string, unknown> = {}) {
  return {
    autor_nombre: 'Lucía Ferrer',
    autor_email: 'lucia.ferrer@ejemplo.es',
    cuerpo: 'Un comentario suficientemente largo.',
    ...cambios,
  }
}

function filaComentario(id: number) {
  return db.from('comentarios').where('id', id).first()
}

async function totalComentarios() {
  const fila = await db.from('comentarios').count('* as total').first()
  return Number(fila.total)
}

test.group('POST /posts/:slug/comentarios', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('deja un comentario pendiente y devuelve la fila completa', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    const antes = Date.now()

    // Act
    const respuesta = await client.post('/posts/post-de-prueba/comentarios').json(unEnvio())

    // Assert
    respuesta.assertStatus(201)
    const cuerpo = respuesta.body()
    assert.sameMembers(Object.keys(cuerpo), ['comentario'])
    const comentario = cuerpo.comentario
    assert.sameMembers(Object.keys(comentario), CAMPOS_COMENTARIO)
    assert.isNumber(comentario.id)
    assert.strictEqual(comentario.post_id, 9001)
    assert.strictEqual(comentario.autor_nombre, 'Lucía Ferrer')
    assert.strictEqual(comentario.cuerpo, 'Un comentario suficientemente largo.')
    assert.strictEqual(comentario.estado, 'pendiente')
    assert.isNull(comentario.padre_id)
    // La fecha se guarda en UTC con formato SQL; se afirma la forma, no el valor.
    assert.match(comentario.creado_en, FORMATO_FECHA)
    assert.closeTo(Date.parse(comentario.creado_en.replace(' ', 'T') + 'Z'), antes, 60_000)
    // BUG (auditoría 1/16): la respuesta incluye el correo de quien comenta.
    assert.strictEqual(comentario.autor_email, 'lucia.ferrer@ejemplo.es')
    assert.notProperty(comentario, 'created_at')
    assert.notProperty(comentario, 'updated_at')

    const guardado = await filaComentario(comentario.id)
    assert.deepEqual(guardado, comentario)
  })

  test('acepta un cuerpo de exactamente cinco caracteres', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ cuerpo: 'Hola!' }))

    // Assert
    respuesta.assertStatus(201)
    assert.strictEqual(respuesta.body().comentario.cuerpo, 'Hola!')
  })

  test('un cuerpo de solo espacios cuenta como vacío', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ cuerpo: '     ' }))

    // Assert
    respuesta.assertStatus(200)
    assert.deepEqual(respuesta.body(), { ok: false, motivo: 'comentario demasiado corto' })
  })

  test('recorta los espacios de alrededor antes de medir y guardar', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ autor_nombre: '  Lucía  ', cuerpo: '  Hola!  ' }))

    // Assert
    respuesta.assertStatus(201)
    assert.strictEqual(respuesta.body().comentario.autor_nombre, 'Lucía')
    assert.strictEqual(respuesta.body().comentario.cuerpo, 'Hola!')
  })

  test('BUG: guarda un padre_id que no existe', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ padre_id: 424242 }))

    // Assert
    respuesta.assertStatus(201)
    assert.strictEqual(respuesta.body().comentario.padre_id, 424242)
  })

  test('el comentario nuevo no aparece en el detalle del post', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    await client.post('/posts/post-de-prueba/comentarios').json(unEnvio())
    const detalle = await client.get('/posts/post-de-prueba')

    // Assert
    detalle.assertStatus(200)
    assert.deepEqual(detalle.body().comentarios, [])
  })

  test('responde 404 si el post no existe', async ({ client, assert }) => {
    // Arrange
    const antes = await totalComentarios()

    // Act
    const respuesta = await client.post('/posts/no-existe/comentarios').json(unEnvio())

    // Assert
    respuesta.assertStatus(404)
    assert.deepEqual(respuesta.body(), { error: 'Post no encontrado' })
    assert.strictEqual(await totalComentarios(), antes)
  })

  test('responde 404 si el post está en borrador', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost({ estado: 'borrador' }))

    // Act
    const respuesta = await client.post('/posts/post-de-prueba/comentarios').json(unEnvio())

    // Assert
    respuesta.assertStatus(404)
    assert.deepEqual(respuesta.body(), { error: 'Post no encontrado' })
  })

  test('el 404 del post va antes que la validación', async ({ client, assert }) => {
    // Act
    const respuesta = await client.post('/posts/no-existe/comentarios').json({})

    // Assert
    respuesta.assertStatus(404)
    assert.deepEqual(respuesta.body(), { error: 'Post no encontrado' })
  })

  test('responde 400 si falta el nombre', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    const antes = await totalComentarios()

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ autor_nombre: undefined }))

    // Assert
    respuesta.assertStatus(400)
    assert.deepEqual(respuesta.body(), { error: 'El nombre es obligatorio' })
    assert.strictEqual(await totalComentarios(), antes)
  })

  test('responde 400 si el nombre está vacío', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ autor_nombre: '' }))

    // Assert
    respuesta.assertStatus(400)
    assert.deepEqual(respuesta.body(), { error: 'El nombre es obligatorio' })
  })

  test('responde 422 si falta el email', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ autor_email: undefined }))

    // Assert
    respuesta.assertStatus(422)
    assert.deepEqual(respuesta.body(), { message: 'Falta el email' })
  })

  test('responde 400 con otra forma si el email no lleva arroba', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ autor_email: 'lucia.ferrer' }))

    // Assert
    respuesta.assertStatus(400)
    assert.deepEqual(respuesta.body(), { errores: ['email no válido'] })
  })

  test('BUG: da por bueno cualquier email con arroba', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ autor_email: '@' }))

    // Assert
    respuesta.assertStatus(201)
    assert.strictEqual(respuesta.body().comentario.autor_email, '@')
  })

  test('BUG: un cuerpo corto responde 200 con ok:false', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    const antes = await totalComentarios()

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ cuerpo: 'Hola' }))

    // Assert
    respuesta.assertStatus(200)
    assert.deepEqual(respuesta.body(), { ok: false, motivo: 'comentario demasiado corto' })
    assert.strictEqual(await totalComentarios(), antes)
  })

  test('sin cuerpo responde 200 con ok:false', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ cuerpo: undefined }))

    // Assert
    respuesta.assertStatus(200)
    assert.deepEqual(respuesta.body(), { ok: false, motivo: 'comentario demasiado corto' })
  })

  test('el nombre se valida antes que el email', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json({ cuerpo: 'x' })

    // Assert
    respuesta.assertStatus(400)
    assert.deepEqual(respuesta.body(), { error: 'El nombre es obligatorio' })
  })

  test('el email se valida antes que el cuerpo', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())

    // Act
    const respuesta = await client
      .post('/posts/post-de-prueba/comentarios')
      .json(unEnvio({ autor_email: 'sin-arroba', cuerpo: 'x' }))

    // Assert
    respuesta.assertStatus(400)
    assert.deepEqual(respuesta.body(), { errores: ['email no válido'] })
  })
})

test.group('DELETE /comentarios/:id', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('el autor borra su comentario', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es' })

    // Assert
    respuesta.assertStatus(200)
    assert.deepEqual(respuesta.body(), { borrado: true })
    assert.isNull(await filaComentario(9101))
  })

  test('compara el email sin mayúsculas ni espacios', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .json({ autor_email: '  Lucia.Ferrer@EJEMPLO.es ' })

    // Assert
    respuesta.assertStatus(200)
    assert.deepEqual(respuesta.body(), { borrado: true })
    assert.isNull(await filaComentario(9101))
  })

  test('acepta el email por query string', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .qs({ autor_email: 'lucia.ferrer@ejemplo.es' })

    // Assert
    respuesta.assertStatus(200)
    assert.isNull(await filaComentario(9101))
  })

  test('BUG: la clave de moderación escrita en el código borra cualquier comentario', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario({ estado: 'aprobado' }))

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .header('x-clave-moderacion', CLAVE_MODERACION)

    // Assert
    respuesta.assertStatus(200)
    assert.deepEqual(respuesta.body(), { borrado: true })
    assert.isNull(await filaComentario(9101))
  })

  test('responde 403 sin credenciales y no borra', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client.delete('/comentarios/9101')

    // Assert
    respuesta.assertStatus(403)
    assert.deepEqual(respuesta.body(), { error: 'No puedes borrar este comentario' })
    assert.isNotNull(await filaComentario(9101))
  })

  test('responde 403 con el email de otra persona', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .json({ autor_email: 'otra@ejemplo.es' })

    // Assert
    respuesta.assertStatus(403)
    assert.deepEqual(respuesta.body(), { error: 'No puedes borrar este comentario' })
    assert.isNotNull(await filaComentario(9101))
  })

  test('responde 403 con una clave de moderación incorrecta', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .header('x-clave-moderacion', 'otra-clave')

    // Assert
    respuesta.assertStatus(403)
    assert.deepEqual(respuesta.body(), { error: 'No puedes borrar este comentario' })
  })

  test('responde 404 si el comentario no existe', async ({ client, assert }) => {
    // Act
    const respuesta = await client
      .delete('/comentarios/999999')
      .header('x-clave-moderacion', CLAVE_MODERACION)

    // Assert
    respuesta.assertStatus(404)
    assert.deepEqual(respuesta.body(), { error: 'Comentario no encontrado' })
  })

  test('responde 404 si el id no es un número', async ({ client, assert }) => {
    // Act
    const respuesta = await client.delete('/comentarios/abc')

    // Assert
    respuesta.assertStatus(404)
    assert.deepEqual(respuesta.body(), { error: 'Comentario no encontrado' })
  })

  test('BUG: borrar un comentario deja huérfanas sus respuestas', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())
    await db.table('comentarios').insert(unComentario({ id: 9102, padre_id: 9101 }))

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .header('x-clave-moderacion', CLAVE_MODERACION)

    // Assert
    respuesta.assertStatus(200)
    assert.isNull(await filaComentario(9101))
    const respuestaHuerfana = await filaComentario(9102)
    assert.strictEqual(respuestaHuerfana.padre_id, 9101)
  })

  test('BUG: borra comentarios de un post en borrador', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost({ estado: 'borrador' }))
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .delete('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es' })

    // Assert
    respuesta.assertStatus(200)
    assert.isNull(await filaComentario(9101))
  })
})

test.group('PATCH /comentarios/:id', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('el autor edita su comentario pendiente y recibe la fila completa', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .patch('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es', cuerpo: 'Texto corregido.' })

    // Assert
    respuesta.assertStatus(200)
    const cuerpo = respuesta.body()
    assert.sameMembers(Object.keys(cuerpo), ['comentario'])
    assert.sameMembers(Object.keys(cuerpo.comentario), CAMPOS_COMENTARIO)
    assert.deepEqual(cuerpo.comentario, {
      id: 9101,
      post_id: 9001,
      autor_nombre: 'Lucía Ferrer',
      // BUG (auditoría 1/16): la respuesta incluye el correo de quien comenta.
      autor_email: 'lucia.ferrer@ejemplo.es',
      cuerpo: 'Texto corregido.',
      estado: 'pendiente',
      creado_en: '2026-01-02 09:30:00',
      padre_id: null,
    })
    assert.strictEqual((await filaComentario(9101)).cuerpo, 'Texto corregido.')
  })

  test('BUG: acepta un cuerpo de un solo carácter', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .patch('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es', cuerpo: 'x' })

    // Assert
    respuesta.assertStatus(200)
    assert.strictEqual(respuesta.body().comentario.cuerpo, 'x')
  })

  test('responde 403 si el comentario no está pendiente', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario({ estado: 'aprobado' }))

    // Act
    const respuesta = await client
      .patch('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es', cuerpo: 'Texto corregido.' })

    // Assert
    respuesta.assertStatus(403)
    assert.deepEqual(respuesta.body(), { error: 'No puedes editar este comentario' })
    assert.strictEqual((await filaComentario(9101)).cuerpo, 'Un comentario suficientemente largo.')
  })

  test('BUG: compara el email con mayúsculas, al revés que el borrado', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .patch('/comentarios/9101')
      .json({ autor_email: 'Lucia.Ferrer@ejemplo.es', cuerpo: 'Texto corregido.' })

    // Assert
    respuesta.assertStatus(403)
    assert.deepEqual(respuesta.body(), { error: 'No puedes editar este comentario' })
  })

  test('BUG: no admite la clave de moderación, al revés que el borrado', async ({
    client,
    assert,
  }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .patch('/comentarios/9101')
      .header('x-clave-moderacion', CLAVE_MODERACION)
      .json({ cuerpo: 'Texto corregido.' })

    // Assert
    respuesta.assertStatus(403)
    assert.deepEqual(respuesta.body(), { error: 'No puedes editar este comentario' })
  })

  test('responde 400 si falta el cuerpo', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client
      .patch('/comentarios/9101')
      .json({ autor_email: 'lucia.ferrer@ejemplo.es' })

    // Assert
    respuesta.assertStatus(400)
    assert.deepEqual(respuesta.body(), { error: 'Falta el cuerpo' })
  })

  test('la autorización va antes que la validación del cuerpo', async ({ client, assert }) => {
    // Arrange
    await db.table('posts').insert(unPost())
    await db.table('comentarios').insert(unComentario())

    // Act
    const respuesta = await client.patch('/comentarios/9101').json({})

    // Assert
    respuesta.assertStatus(403)
    assert.deepEqual(respuesta.body(), { error: 'No puedes editar este comentario' })
  })

  test('responde 404 si el comentario no existe, antes de autorizar', async ({
    client,
    assert,
  }) => {
    // Act
    const respuesta = await client.patch('/comentarios/999999').json({})

    // Assert
    respuesta.assertStatus(404)
    assert.deepEqual(respuesta.body(), { error: 'Comentario no encontrado' })
  })
})
