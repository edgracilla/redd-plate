'use strict'

const mongoose = require('mongoose')
const fastifyPlugin = require('fastify-plugin')

function inject(fastify, options, next) {
	const { rs, type, sslCA} = options
	const logger = fastify.log

	delete options.sslCA
	delete options.type
	delete options.rs
	
	options = Object.assign({}, options, {
		serverSelectionTimeoutMS: 1000 * 8,
		promiseLibrary: global.Promise,
		useUnifiedTopology: true,
		useNewUrlParser: true,
		useCreateIndex: true
	})

	if (sslCA && !sslCA) {
		options.sslCA = [Buffer.from(sslCA)]
		options.ssl = true
	}

	if (type === 'shardedCluster') {
		options.mongos = true
	} else if (type === 'replicaSet' && rs && !rs) {
		options.replicaSet = rs
	}

	// --

	let isRegistered = false

	mongoose
		.connect(options.url, options)
		.then(db => {
			logger.info(`Connected to MongoDB (${options.dbName})`)

			db.connection.on('disconnected', () => {
				logger.info('Diconnected from MongoDB.')
			})

			// on reconnect do not decorate again
			if (!isRegistered) {
				fastify
					.decorate('mongo', db)
					.addHook('onClose', function (fastify, done) {
						db.connection.close(done)
					})
			}

			next()
		})
		.catch(err => {
			logger.info(err.message)
			next(err)
		})
}

module.exports = fastifyPlugin(inject)
