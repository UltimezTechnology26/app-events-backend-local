import sharp from 'sharp';

interface SharpConfig {
    jpeg: { quality: number; progressive: boolean };
    png: { compressionLevel: number };
    webp: { quality: number };
    avif: { quality: number };
    resize: {
        fit: string;
        position: string;
        background: { r: number; g: number; b: number; alpha: number };
    };
    security: {
        limitInputPixels: number;
        sequentialRead: boolean;
    };
}

const sharpConfig: SharpConfig = {
    jpeg: { quality: 80, progressive: true },
    png: { compressionLevel: 8 },
    webp: { quality: 80 },
    avif: { quality: 80 },
    resize: {
        fit: 'cover',
        position: 'center',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
    },
    security: {
        limitInputPixels: 268402689,
        sequentialRead: true
    }
};

const createSharpProcessor = (options: any = {}) => {
    return sharp(options);
};

export { sharpConfig, createSharpProcessor };
