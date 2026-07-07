require('dotenv').config()
const redis = require('redis')
const redisCache = redis.createClient({
    url: process.env.REDIS_CACHE_URL
}).on('error', err => console.log('Redis Client Error', err.message))
    .on('ready', () => {
        console.log('✅ Redis client is ready and connected!');
    });
const setCache = async ({ key, value, ttl }) => {
    try {
        if (key && value && ttl) {
            console.log("key", key)
            if (!redisCache.isOpen) {
                await redisCache.connect()
                console.log("redisCache.isOpen", redisCache.isOpen)
            }
            await redisCache.set(key, JSON.stringify(value))
            await redisCache.expire(key, ttl)

            return { status: true, message: { alert_message: 'Cache set successful.' } }
        }
        else {
            return { status: false, message: { alert_message: 'Cache not set.' } }
        }
    }
    catch (e) {
        console.log("set cache error:", e.message)
        return { status: false, message: { alert_message: e.message } }
    }
}


const getCache = async ({ key }) => {
    try {

        if (!redisCache.isOpen) {
            await redisCache.connect()
            console.log("redisCache.isOpen", redisCache.isOpen)
        }

        const data = await redisCache.get(key)
        if (data) {
            return { status: true, message: JSON.parse(data) }
        }
        else {
            return { status: false, message: data }
        }

    }
    catch (e) {
        console.log("set cache error:", e.message)
        return { status: false, message: { alert_message: e.message } }
    }
}
const deleteKeysByPattern = async (pattern) => {
    try {
        if (!redisCache.isOpen) {
            await redisCache.connect()
            console.log("redisCache.isOpen", redisCache.isOpen)
        }

        const keys = await redisCache.keys(pattern)
        if (keys.length > 0) {
            await redisCache.del(keys)
            console.log(`Deleted ${keys.length} Redis keys matching: ${pattern}`)
            return { status: true, message: `Deleted ${keys.length} keys` }
        } else {
            console.log(`No Redis keys found matching: ${pattern}`)
            return { status: false, message: 'No keys matched' }
        }
    } catch (e) {
        console.log("deleteKeysByPattern error:", e.message)
        return { status: false, message: { alert_message: e.message } }
    }
}


module.exports = {
    setCache,
    getCache,
    deleteKeysByPattern,

}