'use strict'

/**
 * API Response handler, intended and heavily used in routes.js
 * 
 * @param {object} reply - see Fastify Reply - https://www.fastify.io/docs/latest/Reply/
 * @param {object} payload - the data that is intended to return to the client
 * @param {number} code - the error code to send to the client. default 200
 * 
 * @returns {void}
 */

function apiResp (reply, payload, code = 200) {
  if (!payload) {
    return reply
      .code(404)
      .send({
        code: 404,
        error: 'Not found',
        message: 'Either the specified resource not found or you are not authorized to perform the operation.'
      })
  }

  if (code === 204 && payload) {
    return reply.code(code).send()
  } else {
    return  reply.code(code).send(payload)
  }
}

/**
 * API Error handler, intended and heavily used in routes.js
 * 
 * @param {object} reply - see Fastify Reply - https://www.fastify.io/docs/latest/Reply/
 * @param {object} error - Error Object
 * 
 * @returns {void}
 */

function apiErr (reply, error) {
  // handle validation error
  if (error.ajv) {
    let errors = error.errors
      .map(er => {
        let { dataPath, keyword, message } = er
        let field = (dataPath || '').replace(/^\./, '')

        return {
          message,
          type: keyword,
          field: field || undefined
        }
      })

    return reply
      .code(400)
      .send({
        code: 400,
        message: error.message,
        data: errors
      })
  }

  if (error.name === 'ValidationError') {
    return reply
      .code(400)
      .send({
        code: 400,
        error: 'ValidationError',
        message: error.message,
        data: error.data
      })
  }

  if (error.name === 'AuthError') {
    return reply
      .code(error.code)
      .send({
        code: error.code,
        error: 'AuthError',
        message: error.message
      })
  }

  if (/^Firebase|^Decoding Firebase/.test(error.message)) {
    return reply
      .code(401)
      .send({
        code: 401,
        error: 'FirebaseError',
        message: error.message
      })
  }

  /** Internal Error - unhandle error */

  if (process.env.DEBUG === 'true') {
    console.log('---- DEBUG START DEBUG ----')
    console.log(error) // TODO: to stackdriver
    console.log('---- DEBUG END DEBUG ----')
  }

  return reply
    .code(500)
    .send({
      code: 500,
      error: 'Internal server error',
      message: 'An unexpected error has occurred. Kindly contact support.'
    })
}

module.exports = {
  apiResp,
  apiErr
}