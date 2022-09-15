/**
 * An array of value + error
 * Let's us mimic go programming pattern of dealing with error as a value
 * rather than an exceptio
 *
 * PS : I hate exceptions
 */
export type ErrorTuple<T> = Tuple<T, Error>;

/**
 * An array of 2 values
 */
export type Tuple<T, V> = [T, V];

/**
 * NewTuple : return back a new tuple
 * @param val1
 * @param val2
 * @returns
 */
export function NewTuple<T, V>(val1: T, val2: V): Tuple<T, V> {
    return [val1, val2];
}

/**
 * return back a new error tuple
 * @param val1
 * @param err
 * @returns
 */
export function NewErrorTuple<T>(val1: T, err: Error): ErrorTuple<T> {
    return NewTuple(val1, err);
}
