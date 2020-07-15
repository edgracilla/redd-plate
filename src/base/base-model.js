'use strict'

const mongoose = require('mongoose')
const isEqual = require('lodash/isEqual')
const cloneDeep = require('lodash/cloneDeep')

const deserialize = require('fast-json-parse')
const serialize = require('fast-safe-stringify')

class BaseModel {
	static _init(options) {
		this.resource = this.collection.name
		this.cacher = process.env.CACHE === 'true' ? options.redis : false
	}

	static async _create(data, options) {
		const { expand } = options || {}
		const model = new this()

		let doc = await model.set(data).save()

		doc = doc.toObject()

		if (this.cacher) await this._cache('set', doc)
		if (expand) doc = await this._expand(doc, expand)

		doc.changeLog = { created: true }

		return doc
	}

	static async _read(_id, options) {
		const { expand } = options || {}
		let doc = null

		if (this.cacher) {
			doc = await this._cache('get', _id)
		}

		if (!doc) {
			doc = await this.findOne({ _id }).exec()
			if (!doc) return doc

			doc = doc.toObject()
			if (this.cacher) await this._cache('set', doc)
		}

		if (expand) {
			doc = await this._expand(doc, expand)
		}

		return doc
	}

	static async _update(query, update, options) {
		let { expand, soft } = options || {}
		let doc = await this.findOne(query).exec()

		if (!doc) return null

		soft = soft === void 0 ? false : soft

		const changeLog = {}
		const oldDoc = cloneDeep(doc)
		const keys = Object.keys(update)
		const plainDoc = doc.toObject()

		const comparator = function (a, b) {
			return typeof a === 'object' ? !isEqual(a, b) : a !== b
		}

		const mergeUnique = function (arr1, arr2) {
			return arr1.concat(arr2).reduce((acc, item) => {
				for (let i = 0; i < acc.length; i++) {
					if (isEqual(acc[i], item)) return acc
				}

				return [...acc, item]
			}, [])
		}

		if (typeof soft === 'boolean') {
			if (soft) {
				// soft array update (append new items to existing array)
				keys.forEach(key => {
					doc[key] = Array.isArray(doc[key])
						? mergeUnique(plainDoc[key], update[key])
						: update[key]
				})
			} else {
				// hard array update (overwrite array values with new ones)
				keys.forEach(key => {
					doc[key] = update[key]
				})
			}
		} else if (typeof soft === 'object') {
			// mixed! some fields are soft some are not
			keys.forEach(key => {
				doc[key] =
					Array.isArray(update[key]) && soft[key] === true
						? mergeUnique(plainDoc[key], update[key])
						: update[key]
			})
		}

		const modifieds = doc.modifiedPaths()
		let updDoc = await doc.save()

		if (modifieds.length) {
			modifieds.forEach(field => {
				const updv = updDoc[field] instanceof mongoose.Document
					? updDoc[field].toObject()
					: updDoc[field] // updated value

				const oldv = oldDoc[field] instanceof mongoose.Document
					? oldDoc[field].toObject()
					: oldDoc[field] // old value

				if (Array.isArray(updv) && updv.length) {
					changeLog[field] = {
						added: updv.filter(a => oldv.every(b => comparator(a, b))),
						removed: oldv.filter(b => updv.every(a => comparator(b, a)))
					}

					// fix for same object value but diff ref -> treated as modified (changeLog result is empty)
					if (!changeLog[field].added.length && !changeLog[field].removed.length) {
						modifieds.splice(modifieds.indexOf(field), 1)
						delete changeLog[field]
					}
				} else {
					changeLog[field] = {
						from: oldv,
						to: updv
					}
				}
			})
		}

		updDoc = updDoc.toObject()

		if (this.cacher) await this._cache('set', updDoc)
		if (expand) updDoc = await this._expand(updDoc, expand)

		updDoc.modifieds = modifieds
		updDoc.changeLog = changeLog

		return updDoc
	}

	static async _delete(query) {
		let doc = await this.findOne(query).exec()

		if (!doc) return null

		await doc.remove()
		if (this.cacher) await this._cache('del', doc)

		query.changeLog = { deleted: true }

		return true
	}

	static async _count(query) {
		return await this.find(query).countDocuments()
	}

	static async _search(filter, options, hasNear) {
		let { sort, page, expand, listOnly, limit } = options || {}

		const query = this.find(filter)
		const cquery = this.find(filter)

		limit = +limit || 50
		page = +page || 1

		query.lean()
		query.limit(limit)
		query.skip(limit * (page > 0 ? page - 1 : 0))

		if (sort) {
			query.collation({ locale: 'en' })
			query.sort(sort)
		}

		if (expand) {
			query.deepPopulate(expand)
		}

		let docs = await query.exec()

		const count = hasNear
			? await cquery.count() // deprecated but working with $near query
			: await cquery.countDocuments() // throws Invalid context err if it has $near query

		if (listOnly) return docs

		return {
			page, count, limit,
			pages: Math.ceil(count / limit),
			data: docs
		}
	}

	static async _deleteMany(filter) {
		let docs = []

		if (this.cacher) {
			docs = await this.find(filter).select('_id').exec()
		}

		let ret = await this.deleteMany(filter)

		if (this.cacher && ret.deletedCount) {
			await this._cache('delm', docs)
		}

		return ret
	}

	static _updateMany() {}

	// -- helpers

	static async _cache(action, doc) {
		const _id = typeof doc === 'object' ? doc._id : doc
		const key = `${this.resource}:${_id}`

		switch (action) {
			case 'set':
				return await this.cacher.set(key, serialize(doc))

			case 'del':
				return await this.cacher.del(key)

			case 'get': {
				const strDoc = await this.cacher.get(key)
				const { err, value } = deserialize(strDoc)

				if (!err) return value

				doc = await this.findOne({ _id }).exec()
				await this.cacher.set(key, serialize(doc))

				return doc.toObject()
			}

			case 'delm': {
				const pipe = this.cacher.pipeline()
				const keys = doc.map(item => `${this.resource}:${item._id}`)

				return pipe.del(keys).exec()
			}
		}
	}

	static async _expand (doc, expands) {
		let retDoc = await this
			.findOne({ _id: doc._id })
			.deepPopulate(expands)
			.exec()

		return retDoc.toObject()
	}
}

module.exports = BaseModel
