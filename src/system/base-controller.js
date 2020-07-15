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
			q: { type: 'string' },
			sort: { type: 'string' },
			near: { type: 'string' },
			page: { type: 'integer' },
			expand: { type: 'string' },
			listOnly: { type: 'boolean' },
			docsPerPage: { type: 'integer' }
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
			textSearchKey: 'q',
			betweens: dateFields,
			whitelist: whitelistParams,
			blacklist: {
				q: true,
				page: true,
				sort: true,
				near: true,
				expand: true,
				listOnly: true,
				docsPerPage: true
			}
		})
	}

	// -- utilities

	logActivity(userMeta, doc, resource) {
		this.broker.emit('activities.onLogActivity', {
			resource: resource || this.resource,
			changeLog: doc.changeLog,
			recordId: doc._id,
			meta: userMeta
		})
	}

	pushNotify(userMeta, data) {
		if (data.message) {
			this.broker.emit('notifications.onPushNotify', data, userMeta)
		}
	}

	feedStamp(action, doc) {
		if (['post', 'update', 'delete'].includes(action)) {
			const query = action === 'delete' ? { _id: doc } : { _id: doc._id }

			this.broker.emit('feeds.onStamp', {
				resource: this.resource,
				query, action, doc
			})
		}
	}

	errLog(err) {
		if (!process.env.NODE_ENV) {
			console.log('--- Err Log ---')
			console.log(err)
			console.log('--- Err Log ---')
		}

		this.broker.emit('error-logs.onLog', this.resource, err)
	}
	
	sysLog(err) {
		this.broker.emit('system-logs.onLog', this.resource, err)
	}

	auditLog(doc, meta) {
		this.broker.emit('audit-logs.onLog', this.resource, doc, meta)
	}
}

module.exports = BaseController
