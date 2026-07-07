import { createClient, RedisClientType } from 'redis';

export enum CacheDuration {
    THIRTY_MINUTES = 1800,      // 30 minutes
    SIX_HOURS = 21600,          // 6 hours
    TWELVE_HOURS = 43200        // 12 hours
}

interface CacheResponse<T = any> {
    status: boolean;
    message: T;
}

interface CacheSetParams {
    key: string;
    value: any;
    ttl: CacheDuration | number;
}

class RedisCache {
    private readonly client: RedisClientType;
    private isConnected: boolean = false;

    constructor() {
        this.client = createClient({
            url: process.env.REDIS_CACHE_URL
        });

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.client.on('error', (err) => {
            console.error('Redis Client Error:', err.message);
        });

        this.client.on('ready', () => {
            console.log('✅ Redis client is ready and connected!');
            this.isConnected = true;
        });

        this.client.on('end', () => {
            console.log('❌ Redis client disconnected');
            this.isConnected = false;
        });
    }

    private async ensureConnection(): Promise<void> {
        if (!this.isConnected) {
            await this.client.connect();
        }
    }

    async setCache({ key, value, ttl }: CacheSetParams): Promise<CacheResponse> {
        try {
            if (!key || value === undefined || !ttl) {
                return { status: false, message: { alert_message: 'Cache not set: missing parameters' } };
            }

            await this.ensureConnection();

            const serializedValue = JSON.stringify(value);
            await this.client.setEx(key, ttl, serializedValue);

            return { status: true, message: { alert_message: 'Cache set successful.' } };
        } catch (error) {
            console.error('Set cache error:', error instanceof Error ? error.message : error);
            return { status: false, message: { alert_message: error instanceof Error ? error.message : 'Unknown error' } };
        }
    }

    async getCache<T = any>({ key }: { key: string }): Promise<CacheResponse<T>> {
        try {
            if (!key) {
                return { status: false, message: null as T };
            }

            await this.ensureConnection();

            const data = await this.client.get(key);

            if (data) {
                const parsedData = JSON.parse(data);
                return { status: true, message: parsedData };
            } else {
                return { status: false, message: null as T };
            }
        } catch (error) {
            console.error('Get cache error:', error instanceof Error ? error.message : error);
            return { status: false, message: null as T };
        }
    }

    async deleteKeysByPattern(pattern: string): Promise<CacheResponse<string>> {
        try {
            if (!pattern) {
                return { status: false, message: 'Pattern is required' };
            }

            await this.ensureConnection();

            const keys = await this.client.keys(pattern);

            if (keys.length > 0) {
                await this.client.del(keys);
                console.log(`Deleted ${keys.length} Redis keys matching: ${pattern}`);
                return { status: true, message: `Deleted ${keys.length} keys` };
            } else {
                console.log(`No Redis keys found matching: ${pattern}`);
                return { status: false, message: 'No keys matched' };
            }
        } catch (error) {
            console.error('Delete keys by pattern error:', error instanceof Error ? error.message : error);
            return { status: false, message: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    async deleteKey(key: string): Promise<CacheResponse<boolean>> {
        try {
            if (!key) {
                return { status: false, message: false };
            }

            await this.ensureConnection();
            const result = await this.client.del(key);

            return { status: true, message: result > 0 };
        } catch (error) {
            console.error('Delete key error:', error instanceof Error ? error.message : error);
            return { status: false, message: false };
        }
    }

    async getKeyTTL(key: string): Promise<CacheResponse<number>> {
        try {
            if (!key) {
                return { status: false, message: -1 };
            }

            await this.ensureConnection();
            const ttl = await this.client.ttl(key);

            return { status: true, message: ttl };
        } catch (error) {
            console.error('Get TTL error:', error instanceof Error ? error.message : error);
            return { status: false, message: -1 };
        }
    }

    async exists(key: string): Promise<CacheResponse<boolean>> {
        try {
            if (!key) {
                return { status: false, message: false };
            }

            await this.ensureConnection();
            const exists = await this.client.exists(key);

            return { status: true, message: exists === 1 };
        } catch (error) {
            console.error('Exists check error:', error instanceof Error ? error.message : error);
            return { status: false, message: false };
        }
    }

    async disconnect(): Promise<void> {
        if (this.isConnected) {
            await this.client.quit();
        }
    }
}

const redisCache = new RedisCache();

export default redisCache;
export { CacheResponse, CacheSetParams };
