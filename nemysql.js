/** 
* @description MeshCentral database abstraction layer for MySQL to be Mongo-like
* @author Antigravity
* @license Apache-2.0
*/

const crypto = require('crypto');

function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.randomFillSync(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

class NEMysql {
    constructor(pool) {
        this.pool = pool;
        this._find = null;
        this._proj = null;
        this._limit = null;
        this._sort = null;

        // Create table
        this.pool.query(
            "CREATE TABLE IF NOT EXISTS plugin_scripttask (_id VARCHAR(128) PRIMARY KEY, doc LONGTEXT)",
            (err) => {
                if (err) console.error("PLUGIN: ScriptTask: Failed to create MySQL table", err);
            }
        );
    }

    _compileWhere(cond) {
        let parts = [];
        let vals = [];
        for (let k in cond) {
            if (k === '$or') {
                let oParts = [];
                for (let c of cond[k]) {
                    let cp = this._compileWhere(c);
                    oParts.push(`(${cp.sql})`);
                    vals.push(...cp.vals);
                }
                parts.push(`(${oParts.join(' OR ')})`);
            } else if (k === '$and') {
                let oParts = [];
                for (let c of cond[k]) {
                    let cp = this._compileWhere(c);
                    oParts.push(`(${cp.sql})`);
                    vals.push(...cp.vals);
                }
                parts.push(`(${oParts.join(' AND ')})`);
            } else if (k === '_id' && typeof cond[k] === 'string') {
                parts.push(`_id = ?`);
                vals.push(cond[k]);
            } else {
                let v = cond[k];
                let path = `$.${k}`;
                if (v && typeof v === 'object' && v.$in) {
                    let places = v.$in.map(() => '?').join(',');
                    if (places.length === 0) {
                        parts.push('1=0'); // Match nothing
                    } else {
                        parts.push(`JSON_UNQUOTE(JSON_EXTRACT(doc, '${path}')) IN (${places})`);
                        vals.push(...v.$in.map(String));
                    }
                } else if (v && typeof v === 'object' && v.$lte !== undefined) {
                    parts.push(`CAST(JSON_EXTRACT(doc, '${path}') AS SIGNED) <= ?`);
                    vals.push(v.$lte);
                } else if (v && typeof v === 'object' && v.$gte !== undefined) {
                    parts.push(`CAST(JSON_EXTRACT(doc, '${path}') AS SIGNED) >= ?`);
                    vals.push(v.$gte);
                } else if (v === null) {
                    parts.push(`JSON_TYPE(JSON_EXTRACT(doc, '${path}')) = 'NULL' OR JSON_EXTRACT(doc, '${path}') IS NULL`);
                } else {
                    parts.push(`JSON_UNQUOTE(JSON_EXTRACT(doc, '${path}')) = ?`);
                    vals.push(String(v));
                }
            }
        }
        return { sql: parts.length ? parts.join(' AND ') : '1', vals: vals };
    }

    find(args, proj) {
        this._find = args;
        this._proj = proj;
        this._sort = null;
        this._limit = null;
        return this;
    }

    project(args) { this._proj = args; return this; }
    sort(args) { this._sort = args; return this; }
    limit(limit) { this._limit = limit; return this; }

    toArray(callback) {
        return new Promise((resolve, reject) => {
            let where = this._compileWhere(this._find || {});
            let query = `SELECT doc FROM plugin_scripttask WHERE ${where.sql}`;

            if (this._sort) {
                let order = [];
                for (let sk in this._sort) {
                    let dir = this._sort[sk] === 1 ? 'ASC' : 'DESC';
                    order.push(`JSON_EXTRACT(doc, '$.${sk}') ${dir}`);
                }
                if (order.length) query += ` ORDER BY ${order.join(', ')}`;
            }
            if (this._limit) {
                query += ` LIMIT ${parseInt(this._limit)}`;
            }

            this.pool.query(query, where.vals, (err, rows) => {
                if (err) {
                    if (callback) callback(err, null);
                    return reject(err);
                }

                let docs = rows.map(r => {
                    try { return JSON.parse(r.doc); } catch (e) { return {}; }
                });

                // Memory projection (simplistic)
                if (this._proj) {
                    let inc = Object.keys(this._proj).filter(k => this._proj[k] === 1);
                    if (inc.length > 0) {
                        docs = docs.map(d => {
                            let nd = {};
                            inc.forEach(k => { if (d[k] !== undefined) nd[k] = d[k]; });
                            return nd;
                        });
                    }
                }

                if (callback) callback(null, docs);
                resolve(docs);
            });
        });
    }

    insertOne(args) {
        return new Promise((resolve, reject) => {
            if (!args._id) args._id = uuidv4();
            this.pool.query("INSERT INTO plugin_scripttask (_id, doc) VALUES (?, ?)", [args._id, JSON.stringify(args)], (err) => {
                if (err) return reject(err);
                resolve({ insertedId: args._id });
            });
        });
    }

    deleteOne(filter) {
        return new Promise((resolve, reject) => {
            let cw = this._compileWhere(filter);
            this.pool.query(`DELETE FROM plugin_scripttask WHERE ${cw.sql} LIMIT 1`, cw.vals, (err, res) => {
                if (err) return reject(err);
                resolve({ deletedCount: res.affectedRows });
            });
        });
    }

    deleteMany(filter) {
        return new Promise((resolve, reject) => {
            let cw = this._compileWhere(filter);
            this.pool.query(`DELETE FROM plugin_scripttask WHERE ${cw.sql}`, cw.vals, (err, res) => {
                if (err) return reject(err);
                resolve({ deletedCount: res.affectedRows });
            });
        });
    }

    updateOne(filter, update, options = { upsert: false }) {
        return new Promise((resolve, reject) => {
            let cw = this._compileWhere(filter);
            if (!update.$set) return resolve({ matchedCount: 0, modifiedCount: 0 }); // Simplify

            // Build JSON_SET
            let setKeys = Object.keys(update.$set);
            if (setKeys.length === 0) return resolve({ matchedCount: 0, modifiedCount: 0 });

            let jsonSetParts = [];
            let jsonSetVals = [];
            for (let k of setKeys) {
                jsonSetParts.push(`'$.${k}'`);
                // Use JSON object if object, else string/number
                jsonSetParts.push(`CAST(? AS JSON)`);
                let val = update.$set[k];
                if (val && typeof val === 'object') val = JSON.stringify(val);
                else val = JSON.stringify(val); // MySQL JSON_SET needs JSON text even for scalar if CAST(? AS JSON) is used, wait! CAST('\"foo\"' AS JSON) works.
                jsonSetVals.push(val);
            }

            let query = `UPDATE plugin_scripttask SET doc = JSON_SET(doc, ${jsonSetParts.join(', ')}) WHERE ${cw.sql} LIMIT 1`;

            this.pool.query(query, [...jsonSetVals, ...cw.vals], (err, res) => {
                if (err) return reject(err);
                if (res.affectedRows === 0 && options.upsert) {
                    let insertDoc = Object.assign({}, filter, update.$set);
                    this.insertOne(insertDoc).then(r => resolve({ matchedCount: 0, modifiedCount: 1, upsertedId: r.insertedId })).catch(reject);
                } else {
                    resolve({ matchedCount: res.affectedRows, modifiedCount: res.affectedRows });
                }
            });
        });
    }

    updateMany(filter, update, options = { upsert: false }) {
        return new Promise((resolve, reject) => {
            let cw = this._compileWhere(filter);
            if (!update.$set) return resolve({ matchedCount: 0, modifiedCount: 0 });

            let setKeys = Object.keys(update.$set);
            if (setKeys.length === 0) return resolve({ matchedCount: 0, modifiedCount: 0 });

            let jsonSetParts = [];
            let jsonSetVals = [];
            for (let k of setKeys) {
                jsonSetParts.push(`'$.${k}'`);
                jsonSetParts.push(`CAST(? AS JSON)`);
                let val = update.$set[k];
                if (val && typeof val === 'object') val = JSON.stringify(val);
                else val = JSON.stringify(val);
                jsonSetVals.push(val);
            }

            let query = `UPDATE plugin_scripttask SET doc = JSON_SET(doc, ${jsonSetParts.join(', ')}) WHERE ${cw.sql}`;

            this.pool.query(query, [...jsonSetVals, ...cw.vals], (err, res) => {
                if (err) return reject(err);
                resolve({ matchedCount: res.affectedRows, modifiedCount: res.affectedRows });
            });
        });
    }
}

module.exports = NEMysql;
