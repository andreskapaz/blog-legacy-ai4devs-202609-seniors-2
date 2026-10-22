/*
|--------------------------------------------------------------------------
| Rutas de la API del blog «Corriente»
|--------------------------------------------------------------------------
|
| Todo el blog vive en este archivo: el SQL, la validación, las reglas de
| negocio y el formato de la respuesta. Empezó con dos rutas "provisionales"
| para salir del paso antes de una feria y nunca se movió de aquí.
|
| No hay controladores, ni servicios, ni repositorios, ni DTOs. Las filas de
| la base de datos se devuelven tal cual salen del `select *`.
|
*/

import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import db from '@adonisjs/lucid/services/db'
import { controllers } from '#generated/controllers'

const POR_PAGINA = 5
const MAX_RELACIONADOS = 2
const MAX_RECIENTES = 4

router.get('/', () => {
  return { servicio: 'corriente-api', estado: 'ok' }
})

/* -------------------------------------------------------------------------
 * GET /posts — listado paginado de publicados, con filtros
 * ---------------------------------------------------------------------- */
router.get('/posts', async ({ request, response }) => {
  const pagina = Number(request.input('pagina', 1))
  const categoria = request.input('categoria')
  const etiqueta = request.input('etiqueta')
  const autor = request.input('autor')
  const q = request.input('q')

  if (!pagina || pagina < 1) {
    return response.status(400).send({ error: 'pagina inválida' })
  }

  let donde = " where estado = 'publicado'"
  const parametros: any[] = []

  if (categoria) {
    // Se filtra por el nombre copiado dentro del post, no por la tabla categorias.
    donde += ' and categoria_nombre = ?'
    parametros.push(categoria)
  }
  if (etiqueta) {
    // Las etiquetas son una cadena con comas, así que esto es un LIKE y punto.
    donde += ' and etiquetas like ?'
    parametros.push('%' + etiqueta + '%')
  }
  if (autor) {
    donde += ' and autor_id = ?'
    parametros.push(autor)
  }
  if (q) {
    donde += ' and (titulo like ? or resumen like ? or cuerpo like ?)'
    parametros.push('%' + q + '%', '%' + q + '%', '%' + q + '%')
  }

  const totales: any = await db.rawQuery('select count(*) as total from posts' + donde, parametros)
  const total = totales[0].total

  const filas: any = await db.rawQuery(
    'select *, (select count(*) from comentarios c where c.post_id = posts.id and c.estado <> ' +
      "'pendiente') as num_comentarios from posts" +
      donde +
      ' order by publicado_en desc limit ? offset ?',
    parametros.concat([POR_PAGINA, (pagina - 1) * POR_PAGINA])
  )

  return response.send({
    pagina: pagina,
    porPagina: POR_PAGINA,
    total: total,
    datos: filas,
  })
})

/* -------------------------------------------------------------------------
 * GET /posts/recientes — los N últimos publicados (para la barra lateral)
 * ---------------------------------------------------------------------- */
router.get('/posts/recientes', async ({ request, response }) => {
  let cuantos = Number(request.input('limite', MAX_RECIENTES))
  if (isNaN(cuantos)) cuantos = MAX_RECIENTES
  if (cuantos > 20) cuantos = 20

  const filas: any = await db.rawQuery(
    "select * from posts where estado = 'publicado' order by publicado_en desc limit ?",
    [cuantos]
  )

  return response.send({ datos: filas })
})

/* -------------------------------------------------------------------------
 * GET /posts/:slug — detalle completo
 * ---------------------------------------------------------------------- */
router.get('/posts/:slug', async ({ params, response }) => {
  const posts: any = await db.rawQuery(
    "select * from posts where slug = ? and estado = 'publicado' limit 1",
    [params.slug]
  )
  if (posts.length === 0) {
    return response.status(404).send({ error: 'Post no encontrado' })
  }
  const post = posts[0]

  const autores: any = await db.rawQuery('select * from autores where id = ? limit 1', [
    post.autor_id,
  ])
  const autor = autores[0] || null
  if (autor && autor.redes) {
    try {
      autor.redes = JSON.parse(autor.redes)
    } catch (e) {
      autor.redes = {}
    }
  }

  const categorias: any = await db.rawQuery('select * from categorias where id = ? limit 1', [
    post.categoria_id,
  ])

  // Las etiquetas hay que reconstruirlas partiendo la cadena por comas y
  // buscando cada nombre en la tabla, porque no existe la tabla pivote.
  const nombresEtiquetas = String(post.etiquetas || '')
    .split(',')
    .map((e: string) => e.trim())
    .filter((e: string) => e !== '')
  let etiquetas: any = []
  if (nombresEtiquetas.length > 0) {
    const huecos = nombresEtiquetas.map(() => '?').join(',')
    etiquetas = await db.rawQuery(
      'select * from etiquetas where nombre in (' + huecos + ')',
      nombresEtiquetas
    )
  }

  // Solo los comentarios aprobados. La comparación es exacta, así que los que
  // se guardaron como 'Aprobado' o como 'ok' no salen por aquí.
  const comentarios: any = await db.rawQuery(
    "select * from comentarios where post_id = ? and estado = 'aprobado' order by creado_en asc",
    [post.id]
  )

  const anteriores: any = await db.rawQuery(
    "select id, titulo, slug, imagen_portada from posts where estado = 'publicado' and publicado_en < ? order by publicado_en desc limit 1",
    [post.publicado_en]
  )
  const siguientes: any = await db.rawQuery(
    "select id, titulo, slug, imagen_portada from posts where estado = 'publicado' and publicado_en > ? order by publicado_en asc limit 1",
    [post.publicado_en]
  )

  return response.send({
    post: post,
    autor: autor,
    categoria: categorias[0] || null,
    etiquetas: etiquetas,
    comentarios: comentarios,
    anterior: anteriores[0] || null,
    siguiente: siguientes[0] || null,
  })
})

/* -------------------------------------------------------------------------
 * GET /posts/:slug/relacionados — por categoría y etiquetas compartidas
 * ---------------------------------------------------------------------- */
router.get('/posts/:slug/relacionados', async ({ params, response }) => {
  const base: any = await db.rawQuery(
    "select * from posts where slug = ? and estado = 'publicado' limit 1",
    [params.slug]
  )
  if (base.length === 0) {
    return response.status(404).send({ error: 'Post no encontrado' })
  }
  const post = base[0]

  const candidatos: any = await db.rawQuery(
    "select * from posts where estado = 'publicado' and id <> ? order by publicado_en desc",
    [post.id]
  )

  const misEtiquetas = String(post.etiquetas || '')
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter((e: string) => e !== '')

  const puntuados: any[] = []
  for (let i = 0; i < candidatos.length; i++) {
    const c = candidatos[i]
    let puntos = 0
    if (c.categoria_id === post.categoria_id) puntos = puntos + 2
    const suyas = String(c.etiquetas || '')
      .split(',')
      .map((e: string) => e.trim().toLowerCase())
    for (let j = 0; j < suyas.length; j++) {
      if (misEtiquetas.indexOf(suyas[j]) !== -1) puntos = puntos + 1
    }
    if (puntos > 0) puntuados.push({ fila: c, puntos: puntos })
  }

  puntuados.sort((a, b) => b.puntos - a.puntos)
  const elegidos = puntuados.slice(0, MAX_RELACIONADOS)

  // Una consulta por cada relacionado para el número de comentarios, y otra
  // para el autor. Con dos relacionados son cuatro viajes extra a la base.
  const salida: any[] = []
  for (let i = 0; i < elegidos.length; i++) {
    const fila = elegidos[i].fila
    const cuenta: any = await db.rawQuery(
      "select count(*) as total from comentarios where post_id = ? and estado <> 'pendiente'",
      [fila.id]
    )
    const autor: any = await db.rawQuery('select * from autores where id = ? limit 1', [
      fila.autor_id,
    ])
    fila.num_comentarios = cuenta[0].total
    fila.autor = autor[0] || null
    salida.push(fila)
  }

  return response.send({ datos: salida })
})

/* -------------------------------------------------------------------------
 * GET /categorias — con recuento de posts publicados
 * ---------------------------------------------------------------------- */
router.get('/categorias', async ({ response }) => {
  const filas: any = await db.rawQuery(
    'select c.*, (select count(*) from posts p where p.categoria_id = c.id and ' +
      "p.estado = 'publicado') as num_posts from categorias c order by c.nombre asc"
  )
  return response.send({ datos: filas })
})

/* -------------------------------------------------------------------------
 * GET /etiquetas — con recuento de posts publicados
 * ---------------------------------------------------------------------- */
router.get('/etiquetas', async ({ response }) => {
  const etiquetas: any = await db.rawQuery('select * from etiquetas order by nombre asc')

  // Como las etiquetas de un post son una cadena, el recuento se hace con un
  // LIKE por etiqueta: once etiquetas, once consultas.
  for (let i = 0; i < etiquetas.length; i++) {
    const cuenta: any = await db.rawQuery(
      "select count(*) as total from posts where estado = 'publicado' and etiquetas like ?",
      ['%' + etiquetas[i].nombre + '%']
    )
    etiquetas[i].num_posts = cuenta[0].total
  }

  return response.send({ datos: etiquetas })
})

/* -------------------------------------------------------------------------
 * GET /autores/:id — ficha del autor y sus posts
 * ---------------------------------------------------------------------- */
router.get('/autores/:id', async ({ params, response }) => {
  const autores: any = await db.rawQuery('select * from autores where id = ? limit 1', [params.id])
  if (autores.length === 0) {
    return response.status(404).send({ error: 'Autor no encontrado' })
  }
  const autor = autores[0]
  if (autor.redes) {
    try {
      autor.redes = JSON.parse(autor.redes)
    } catch (e) {
      autor.redes = {}
    }
  }

  const posts: any = await db.rawQuery(
    'select * from posts where autor_id = ? order by publicado_en desc',
    [params.id]
  )

  return response.send({ autor: autor, posts: posts })
})

/* -------------------------------------------------------------------------
 * Comentarios
 * ---------------------------------------------------------------------- */
router.post('/posts/:slug/comentarios', [controllers.Comentarios, 'store'])
router.patch('/comentarios/:id', [controllers.Comentarios, 'update'])
router.delete('/comentarios/:id', [controllers.Comentarios, 'destroy'])

/* -------------------------------------------------------------------------
 * Autenticación del starter kit. Esto sí tiene controladores, validadores y
 * transformers: es el ejemplo de cómo debería estar escrito el resto.
 * ---------------------------------------------------------------------- */
router
  .group(() => {
    router
      .group(() => {
        router.post('signup', [controllers.NewAccount, 'store'])
        router.post('login', [controllers.AccessTokens, 'store'])
      })
      .prefix('auth')
      .as('auth')

    router
      .group(() => {
        router.get('profile', [controllers.Profile, 'show'])
        router.post('logout', [controllers.AccessTokens, 'destroy'])
      })
      .prefix('account')
      .as('profile')
      .use(middleware.auth())
  })
  .prefix('/api/v1')
