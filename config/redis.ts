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

const CONNECT_TIMEOUT_MS = 8000;
const COMMAND_TIMEOUT_MS = 8000;

class RedisCache {
    private readonly client: RedisClientType;
    private isConnected: boolean = false;
    private connectingPromise: Promise<void> | null = null;

    constructor() {
        this.client = createClient({
            url: process.env.REDIS_CACHE_URL,
            socket: {
                connectTimeout: CONNECT_TIMEOUT_MS
            }
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

    // Bounds any single Redis command so a hung connection can never stall a request indefinitely.
    private withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Redis ${label} timed out after ${COMMAND_TIMEOUT_MS}ms`));
            }, COMMAND_TIMEOUT_MS);

            promise
                .then((result) => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch((err) => {
                    clearTimeout(timer);
                    reject(err);
                });
        });
    }

    // Concurrent callers await the SAME in-flight connect attempt instead of each
    // calling client.connect() independently, which node-redis does not tolerate.
    private async ensureConnection(): Promise<void> {
        if (this.isConnected) return;

        if (!this.connectingPromise) {
            this.connectingPromise = this.withTimeout(this.client.connect() as unknown as Promise<any>, 'connect')
                .then(() => undefined)
                .finally(() => {
                    this.connectingPromise = null;
                });
        }

        await this.connectingPromise;
    }

    async setCache({ key, value, ttl }: CacheSetParams): Promise<CacheResponse> {
        try {
            if (!key || value === undefined || !ttl) {
                return { status: false, message: { alert_message: 'Cache not set: missing parameters' } };
            }

            await this.ensureConnection();

            const serializedValue = JSON.stringify(value);
            await this.withTimeout(this.client.setEx(key, ttl, serializedValue), 'setEx');

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

            const data = await this.withTimeout(this.client.get(key), 'get');

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

            const keys = await this.withTimeout(this.client.keys(pattern), 'keys');

            if (keys.length > 0) {
                await this.withTimeout(this.client.del(keys), 'del');
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
            const result = await this.withTimeout(this.client.del(key), 'del');

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
            const ttl = await this.withTimeout(this.client.ttl(key), 'ttl');

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
            const exists = await this.withTimeout(this.client.exists(key), 'exists');

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
