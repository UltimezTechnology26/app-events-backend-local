import pino from 'pino';

interface LoggerConfig {
    level: string;
    transport?: {
        target: string;
        options: {
            colorize: boolean;
            translateTime: string;
            ignore: string;
        };
    };
}

const loggerConfig: LoggerConfig = {
    level: 'info',
    transport: process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname'
            }
        }
        : undefined
};

const logger = pino(loggerConfig);

export default logger;
