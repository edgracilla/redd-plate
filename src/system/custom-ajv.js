'use strict'

const Ajv = require('ajv')
const mongoose = require('mongoose')
const setupAsync = require('ajv-async')
const fastifyPlugin = require('fastify-plugin')

// NOTE: created new instance of ajv (instead of using the built-in)
// so that we can freely do manual validation in Controller

/**
 * Validator if a certain 'id' is already exist in 'resource' collection.
 *
 * @param {object} resource - the collection name to lookup
 * @param {object} _id - the identifier to find
 *
 * @throws {Error} - when mongoose find/count fails or collection is not registered
 * @returns {Promise<boolean>}
 */

async function isExists(resource, _id) {
	if (_id === null) {
		// adhoc for optional fields that accepts null
		return Promise.resolve(true)
	}

	if (typeof _id !== 'string' || !/^[a-f\d]{24}$/i.test(_id)) {
		const err = new Error(`Invalid value provided in 'isExists' function! [${resource}:${_id}]`)
		const ajvErr = new Ajv.ValidationError([err])
		return Promise.reject(ajvErr)
	}

	const count = await mongoose
		.model(resource)
		.findById(_id)
		.countDocuments()

	if (!count) {
		const err = new Error(`The specified '${resource}' resource not found!`)
		const ajvErr = new Ajv.ValidationError([err])
		return Promise.reject(ajvErr)
	}

	return Promise.resolve(true)
}

/**
 * Validator if a certain 'field' value is already exist in 'resource' collection.
 *
 * @param {object} tuple - a string combination of 'resource' and 'field' e.g 'users:email'
 * @param {object} value - field value to validate
 *
 * @throws {Error} - when mongoose find/count fails or collection is not registered
 * @throws {Error} - when invalid tuple format has been supplied
 *
 * @returns {Promise<boolean>}
 */

async function isUnique(tuple, value) {
	const [resource, field] = tuple.split(':')
	const query = {}

	if (!field) {
		throw new Error(`Invalid supplied params in 'isUnique' validator, must be <resource:field>.`)
	}

	query[field] = value

	const count = await mongoose
		.model(resource)
		.find(query)
		.countDocuments()

	if (count) {
		const err = new Error(`The ${resource} '${field}' field must be unique.`)
		const ajvErr = new Ajv.ValidationError([err])
		return Promise.reject(ajvErr)
	}

	return Promise.resolve(true)
}

/**
 * Plugin Injector - see https://github.com/fastify/fastify-plugin
 * Using Decorator - see https://www.fastify.io/docs/latest/Decorators/
 *
 * @param {object} fastify
 * @param {object} options
 * @param {object} next
 *
 * @returns {void}
 */

function inject(fastify, options, next) {
	const ajv = setupAsync(new Ajv(options))

	ajv.addKeyword('isExists', { validate: isExists, async: true, errors: true })
	ajv.addKeyword('isUnique', { validate: isUnique, async: true, errors: true })

	fastify.decorate('ajv', ajv)
	next()
}

module.exports = fastifyPlugin(inject)
