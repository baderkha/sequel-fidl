import { AxiosInstance } from 'axios';
import { DBType } from '../model/Connections';

import { DBVersions } from '../model/DBVersions';
import { Sequelize } from 'sequelize';
import { DBVersionsSQLite } from './DBVersionsSQLite';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
export class DBVersionsRestAdapter extends DBVersionsSQLite {
    private client: AxiosInstance;
    private hasCache: boolean;
    static imagesToCheck = ['postgres', 'mysql', 'mariadb'];
    static readonly cacheStampFile: string = '.db_versions_cache_stamp';
    private cachePath: string;

    constructor(
        axios: AxiosInstance,
        cacheFileBasePath: string,
        mdl: DBVersions,
        con: Sequelize
    ) {
        super(mdl, con);
        this.client = axios;
        this.cachePath = path.join(
            cacheFileBasePath,
            DBVersionsRestAdapter.cacheStampFile
        );
        try {
            let res = readFileSync(this.cachePath);

            this.hasCache = parseInt(res.toString(), 10) > Date.now();
        } catch (err) {
            mkdirSync(cacheFileBasePath, { recursive: true });
            this.hasCache = false;
        }
    }

    private async getAllVerionsForImageFromDocker(imageName: string) {
        let res: Array<DBVersions> = new Array();
        let canGonext = true;
        let pageNumber = 1;

        while (canGonext) {
            res = [
                ...res,
                ...(await this.client
                    .get(
                        `https://registry.hub.docker.com/v2/repositories/library/${imageName}/tags?page_size=100&page=${pageNumber}`
                    )
                    .then((data) => {
                        if (!data.data.next) {
                            canGonext = false;
                        }
                        return data.data.results.map((val: any) => {
                            let r = new DBVersions();
                            r.version = val.name;
                            r.name = imageName as DBType;
                            r.createdAt = new Date(Date.now());
                            r.updatedAt = r.createdAt;
                            return r;
                        });
                    })
                    .catch(() => {
                        canGonext = false;
                        return [];
                    })),
            ];
            pageNumber++;
        }

        return res;
    }

    async scrapeVersions(): Promise<DBVersions[]> {
        const res = DBVersionsRestAdapter.imagesToCheck.map((imageName) => {
            return this.getAllVerionsForImageFromDocker(imageName);
        });
        console.time('test');
        const versions = await Promise.all(res);
        console.timeEnd('test');
        const r = versions.reduce((val1, val2) => val1.concat(val2));

        var future = new Date();
        future.setDate(future.getDate() + 30);
        writeFileSync(this.cachePath, future.getTime().toString());

        return r;
    }

    async FindAll(): Promise<DBVersions[]> {
        if (!this.hasCache) {
            const all = await this.scrapeVersions();
            await this.CreateMany(...all);
            this.hasCache = true;
            return all;
        }
        return super.FindAll();
    }
}
