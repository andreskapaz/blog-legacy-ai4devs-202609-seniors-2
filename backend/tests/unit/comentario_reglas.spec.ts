import { test } from '@japa/runner'
import { puedeBorrar, puedeEditar } from '#services/comentario_service'

/**
 * Reglas de autorización de comentarios tal como se aplican hoy, incluida la contradicción
 * entre borrar (sin mayúsculas, con clave) y editar (exacto, sin clave, solo pendientes).
 */

const comentario = { autorEmail: 'lucia.ferrer@ejemplo.es', estado: 'pendiente' }

test.group('puedeBorrar', () => {
  test('deja borrar al autor aunque cambien mayúsculas y espacios', ({ assert }) => {
    // Act
    const permitido = puedeBorrar(comentario, { email: '  Lucia.Ferrer@EJEMPLO.es ' })

    // Assert
    assert.isTrue(permitido)
  })

  test('deja borrar a quien trae la clave de moderación', ({ assert }) => {
    // Act
    const permitido = puedeBorrar(comentario, { clave: 'dev-secret-cambiar' })

    // Assert
    assert.isTrue(permitido)
  })

  test('no deja borrar sin credenciales ni con otro email o clave', ({ assert }) => {
    // Act
    const sinNada = puedeBorrar(comentario, {})
    const otroEmail = puedeBorrar(comentario, { email: 'otra@ejemplo.es' })
    const otraClave = puedeBorrar(comentario, { clave: 'otra-clave' })

    // Assert
    assert.isFalse(sinNada)
    assert.isFalse(otroEmail)
    assert.isFalse(otraClave)
  })
})

test.group('puedeEditar', () => {
  test('deja editar al autor con el email exacto si sigue pendiente', ({ assert }) => {
    // Act
    const permitido = puedeEditar(comentario, 'lucia.ferrer@ejemplo.es')

    // Assert
    assert.isTrue(permitido)
  })

  test('no deja editar con el email en otras mayúsculas', ({ assert }) => {
    // Act
    const permitido = puedeEditar(comentario, 'Lucia.Ferrer@ejemplo.es')

    // Assert
    assert.isFalse(permitido)
  })

  test('no deja editar un comentario que ya no está pendiente', ({ assert }) => {
    // Act
    const aprobado = puedeEditar({ ...comentario, estado: 'aprobado' }, 'lucia.ferrer@ejemplo.es')
    const conMayuscula = puedeEditar(
      { ...comentario, estado: 'Pendiente' },
      'lucia.ferrer@ejemplo.es'
    )

    // Assert
    assert.isFalse(aprobado)
    assert.isFalse(conMayuscula)
  })

  test('no deja editar sin email', ({ assert }) => {
    // Act
    const permitido = puedeEditar(comentario, '')

    // Assert
    assert.isFalse(permitido)
  })
})
