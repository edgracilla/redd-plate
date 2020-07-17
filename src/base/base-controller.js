'use strict'

const _ = require('lodash')
const mongoose = require('mongoose')
const MongoQS = require('mongo-querystring')

// validation template
const vtmp = {
	read: {
		$async: true,
		type: 'string',
		pattern: '^[a-f0-9]{24}$'
	},
	create: {
		$async: true,
		type: 'object',
		properties: {},
		required: []
	},
	update: {
		$async: true,
		type: 'object',
		properties: {}
	},
	search: {
		$async: true,
		type: 'object',
		additionalProperties: false,
		properties: {
			sort: { type: 'string' },
			near: { type: 'string' },
			page: { type: 'integer' },
			limit: { type: 'integer' },
			expand: { type: 'string' },
			search: { type: 'string' },
			listOnly: { type: 'boolean' }
		}
	}
}

class BaseController {
	constructor(fastify, options) {
		const { validation, resource, dateFields } = options || {}
		const { create, search } = validation || {}

		let whitelistParams = search ? Object.keys(search.properties || {}) : []

		this.model = mongoose.model(resource)
		this.broker = fastify.broker
		this.resource = resource
		this.validate = {}

		// fix for fastify bool coercion, e.g. "false" to false
		this.patchOptions = {
			schema: {
				query: {
					soft: { type: 'boolean' }
				}
			}
		}

		// -- merge base validation template with controller validation schema

		Object.keys(vtmp).map(key => {
			let schema = {}

			switch (key) {
				case 'create':
					schema = _.assign({}, vtmp[key], create)
					break

				case 'read':
					schema = _.assign({}, vtmp[key], { isExists: resource })
					break

				case 'update':
					schema = _.assign({}, vtmp[key], { properties: create.properties })
					break

				case 'search':
					schema = _.assign({}, vtmp[key], {
						properties: _.assign(
							{},
							search ? search.properties : {},
							vtmp[key].properties
						),
						required: search ? search.required : void 0
					})
					break
			}

			this.validate[key] = fastify.ajv.compile(schema)
		})

		// -- set and build defined queryable mongo fields

		whitelistParams = whitelistParams
			.concat(dateFields)
			.filter(Boolean)
			.reduce((accum, key) => {
				accum[key] = true
				return accum
			}, [])

		this.mqs = new MongoQS({
			betweens: dateFields,
			whitelist: whitelistParams,
			blacklist: {
				page: true,
				sort: true,
				near: true,
				limit: true,
				expand: true,
				search: true,
				listOnly: true
			}
		})
	}
}

module.exports = BaseController
