import { PropsOfType } from '../../../util/object';
import { Tuple } from '../../../util/tuple';
import { IBaseModel } from '../model';

export type Index<T> = PropsOfType<T>;

type ArOfKeys<T> = {
    [K in keyof T]: T[K] extends Function ? never : T[K][];
};

export type MultiIndex<T> = Partial<ArOfKeys<T>>;

/**
 * Basic repository that has basic crud requirements
 */
export interface Repository<T extends IBaseModel> {
    FindAll(): Promise<Array<T>>;
    FindManyByIndex(i: MultiIndex<T>): Promise<Array<T>>;
    FindByIndex(i: Index<T>): Promise<Tuple<T, boolean>>;
    DeleteByIndex(mdl: Index<T>): Promise<Error>;

    Create(mdl: T): Promise<Error>;
    Update(mdl: T): Promise<Error>;

    DeleteMany(i: MultiIndex<T>): Promise<Error>;
    CreateMany(...mdl: T[]): Promise<Error>;
}
