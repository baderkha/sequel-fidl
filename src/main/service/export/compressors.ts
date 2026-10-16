import zlib from 'zlib';
import { Compressor, CompressorDescriptor, CompressorId } from './types';

const clamp = (v: number | undefined, l: Compressor['levels']) =>
    Math.min(l.max, Math.max(l.min, Math.round(v ?? l.default)));

const gzip: Compressor = {
    id: 'gzip',
    label: 'gzip',
    extension: '.gz',
    levels: { min: 1, max: 9, default: 6 },
    create(level) {
        return zlib.createGzip({ level: clamp(level, this.levels) });
    },
};

const brotli: Compressor = {
    id: 'brotli',
    label: 'Brotli',
    extension: '.br',
    levels: { min: 0, max: 11, default: 6 },
    create(level) {
        return zlib.createBrotliCompress({
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: clamp(level, this.levels) },
        });
    },
};

/** stream compressors applied after serializing , 'none' is the absence of one */
const COMPRESSORS: Compressor[] = [gzip, brotli];

export const compressorFor = (id: CompressorId): Compressor | null => COMPRESSORS.find((c) => c.id === id) || null;

export const compressorDescriptors = (): CompressorDescriptor[] =>
    COMPRESSORS.map(({ id, label, extension, levels }) => ({ id, label, extension, levels }));
