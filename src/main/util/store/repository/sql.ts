import { NewTuple, Tuple } from '../../tuple';
import { Sequelize,Op } from 'sequelize';
import { ComparisonOperation, Condition, Index, MultiIndex, Repository } from '.';
import { IBaseModel } from '../model';

/**
 * Base SQL Repository based on the sequlize orm
 * @author Ahmad Baderkhan
 */
export class BaseSQLRepository<T extends IBaseModel> implements Repository<T> {
    protected con: Sequelize;
    protected primaryKeys: string[];
    protected expectedKeys: string;

    protected model: string;

    constructor(mdl: IBaseModel, con: Sequelize) {
        this.model = mdl.ClassName();
        this.primaryKeys = mdl.PrimaryKeys();
        this.expectedKeys = this.primaryKeys.sort().join(',');

        this.con = con;
    }
    FindManyByCondition(i: Array<Condition>): Promise<T[]> {
        const val =  this.conditionToSQLZ(i);
        console.log(val)
        return this.getDb().findAll({
            where : val
        }) as unknown as Promise<T[]>
    }
    FindAll(): Promise<T[]> {
        return this.getDb().findAll() as unknown as Promise<T[]>;
    }
    FindManyByIndex(i: MultiIndex<T>): Promise<T[]> {
        return this.getDb().findAll({
            where: i,
        }) as unknown as Promise<T[]>;
    }
    private validateIndex(i: Index<T> | MultiIndex<T>) {
        const areEqual =
            Object.getOwnPropertyNames(i).sort().join(',') == this.expectedKeys;
        if (!areEqual) {
            throw new Error(
                `Expected the following keys to have values${this.expectedKeys} for an index query`
            );
        }
    }
    private indexQueryFromModel(mdl: IBaseModel): Index<T> {
        const mappedKeys = this.primaryKeys.map((val) => ({
            [val]: (mdl as any)[val],
        }));
        return Object.assign({}, ...mappedKeys);
    }
    FindByIndex(i: Index<T>): Promise<Tuple<T, boolean>> {
        this.validateIndex(i);
        return this.getDb()
            .findOne({
                where: i,
            })
            .then((data) => NewTuple(data as unknown as T, data != null))
            .catch(() => NewTuple(null, false));
    }
    getDb() {
        return this.con.models[this.model];
    }

    Create(mdl: T): Promise<Error> {
        return this.getDb()
            .create({ ...(mdl as any) })
            .then(() => null)
            .catch((err) => err);
    }
    Update(mdl: T): Promise<Error> {
        return this.getDb()
            .update(
                { ...(mdl as any) },
                { where: this.indexQueryFromModel(mdl) }
            )
            .then(() => null)
            .catch((err) => err);
    }
    private conditionToSQLZ(i: Array<Condition>) : Record<string,any> {
        let finalObj: Record<string, any> = {}
       for (let index = 0; index <i.length; index++ ){
        let seqlzOp;
        switch (i[index].op) {
            case ComparisonOperation.GT : {
                seqlzOp = Op.gt
                break;
            }
            case ComparisonOperation.LT : {
                seqlzOp = Op.lt
                break;
            }
            case ComparisonOperation.NE : {
                seqlzOp = Op.ne
                break;
            }
        }
        if (seqlzOp) {
             finalObj[i[index].col] = {
            [seqlzOp] : i[index].value
         }
        } else {
            finalObj[i[index].col] = i[index].value
        }
       
       }
       return finalObj;
    }

    DeleteByCondition(i: Array<Condition>): Promise<Error> {
        return this.getDb().destroy({
            where:this.conditionToSQLZ(i)
        }).then(()=>null).catch((err)=>err)
    }
    DeleteByIndex(i: Index<T>): Promise<Error> {
        this.validateIndex(i);
        return this.getDb()
            .destroy({
                where: i,
            })
            .then(() => null)
            .catch((err) => err);
    }
    DeleteMany(i: MultiIndex<T>): Promise<Error> {
        this.validateIndex(i);
        return this.getDb()
            .destroy({
                where: i,
            })
            .then(() => null)
            .catch((err) => err);
    }
    CreateMany(...mdl: T[]): Promise<Error> {
        return this.getDb()
            .bulkCreate(mdl as any[], {
                ignoreDuplicates: true,
                validate: false,
            })
            .then(() => {
                return null;
            })
            .catch((err) => err);
    }
}
