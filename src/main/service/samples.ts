import { net } from 'electron';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'fs';
import path from 'path';
import { BASE_APP_DATA_PATH } from '../util/application/path';

/**
 * Official MySQL sample databases a playground can start with
 * https://dev.mysql.com/doc/index-other.html
 */
export type SampleDB = {
    id: string;
    name: string;
    description: string;
    url: string;
    /** sql files inside the archive , run in order */
    files: string[];
    /** database the sample creates , the playground opens on it */
    database: string;
};

export const SAMPLES: SampleDB[] = [
    {
        id: 'world',
        name: 'World',
        description: 'Countries, cities and languages. 3 tables, ~5,000 rows. The simplest place to start.',
        url: 'https://downloads.mysql.com/docs/world-db.tar.gz',
        files: ['world-db/world.sql'],
        database: 'world',
    },
    {
        id: 'sakila',
        name: 'Sakila',
        description: 'A DVD rental store: films, actors, customers, rentals. 16 tables with views and triggers, the classic MySQL tutorial schema.',
        url: 'https://downloads.mysql.com/docs/sakila-db.tar.gz',
        files: ['sakila-db/sakila-schema.sql', 'sakila-db/sakila-data.sql'],
        database: 'sakila',
    },
];

export const getSample = (id: string) => SAMPLES.find((s) => s.id === id);

const CACHE_PATH = path.join(BASE_APP_DATA_PATH, 'samples');

/**
 * Download the sample archive once and keep it in the app folder
 * @param sample
 * @returns local path of the archive
 */
export async function fetchSample(sample: SampleDB): Promise<string> {
    mkdirSync(CACHE_PATH, { recursive: true });
    const file = path.join(CACHE_PATH, path.basename(new URL(sample.url).pathname));
    if (existsSync(file)) {
        return file;
    }
    const data = await download(sample.url);
    // write then rename so a failed download never looks cached
    writeFileSync(`${file}.part`, data);
    renameSync(`${file}.part`, file);
    return file;
}

/**
 * GET with electron's chromium network stack , downloads.mysql.com rejects node http clients
 * @param url
 */
const download = (url: string, timeoutMs = 120 * 1000): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        const req = net.request(url);
        const timer = setTimeout(() => {
            req.abort();
            reject(new Error('download timed out'));
        }, timeoutMs);
        req.on('response', (res) => {
            if (res.statusCode !== 200) {
                clearTimeout(timer);
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                clearTimeout(timer);
                resolve(Buffer.concat(chunks));
            });
            res.on('error', (e: Error) => {
                clearTimeout(timer);
                reject(e);
            });
        });
        req.on('error', (e) => {
            clearTimeout(timer);
            reject(e);
        });
        req.end();
    });
