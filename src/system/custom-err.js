'use strict'

class ValidationError extends Error {
  constructor (message, data) {
    super(message)

    this.data = data || []
    this.name = 'ValidationError'
  }
}

class AuthError extends Error {
  constructor (code, message) {
    if (typeof code === 'string') {
      message = code
      code = 401
    }

    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

module.exports = {
  ValidationError,
  AuthError
}