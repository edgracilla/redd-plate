'use strict'

module.exports = {
  ajv: require('./src/system/custom-ajv'),
  mongoose: require('./src/system/mongoose'),
  apiReactor: require('./src/system/api-reactor'),

  BaseModel: require('./src/base/base-model'),
  BaseController: require('./src/base/base-controller'),
  customError: require('./src/system/custom-err')
}