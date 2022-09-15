type NonFunctionPropertyNames<T> = {
    [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];

export type PropsOfType<T> = Partial<Pick<T, NonFunctionPropertyNames<T>>>;

function setData(scope: any, items: any) {
    for (let key in items) {
        scope[key] = items[key];
    }
}

/**
 * Constructs a class with the data fields only
 * @param type
 * @param data
 * @returns
 */
export function Make<T>(type: new () => T, data: PropsOfType<T>): T {
    let instance = new type();
    setData(instance, data);
    return instance;
}
