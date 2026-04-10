import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST, // Redis server host
  port: process.env.REDIS_PORT, // Redis server port
});

redis.on('error', (err) => console.error('Redis error:', err));
redis.on('connect', () => console.log('Redis connected'));

export default redis;