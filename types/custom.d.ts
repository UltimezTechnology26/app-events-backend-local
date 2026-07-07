// For packages without official types
declare module 'mongo-sanitize' {
    function sanitize(input: any): any;
    export = sanitize;
}

declare module 'geolib' {
    export function getDistance(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): number;
    export function isPointInPolygon(point: { latitude: number; longitude: number }, polygon: Array<{ latitude: number; longitude: number }>): boolean;
    export function findNearestPoint(point: { latitude: number; longitude: number }, points: Array<{ latitude: number; longitude: number }>): any;
}

declare module 'express-ip' {
    import { RequestHandler } from 'express';
    function ip(): RequestHandler;
    export = ip;
}

declare module 'request-ip' {
    import { Request } from 'express';
    function getClientIp(req: Request): string;
    export = getClientIp;
}

declare module 'verify-apple-id-token' {
    export function verifyAppleIdToken(token: string): Promise<any>;
}

declare module 'pino-pretty' {
    interface PrettyOptions {
        colorize?: boolean;
        translateTime?: string;
        ignore?: string;
    }
}

// AWS SDK types (already included in @aws-sdk/client-s3)
// SendGrid types (already included in @sendgrid/mail)
// Agenda types (need custom)
declare module 'agenda' {
    interface Job {
        attrs: any;
        save(): Promise<void>;
        remove(): Promise<void>;
    }

    interface Agenda {
        define(name: string, options: any, processor: (job: Job) => Promise<void>): void;
        start(): Promise<void>;
        on(event: string, callback: () => void): void;
        create(name: string, data: any): Job;
    }

    function agenda(config?: any): Agenda;
    export = agenda;
}