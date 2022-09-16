import { ErrorTuple } from '../../util/tuple';
import { Sequelize } from 'sequelize';
import { DBType } from '../../model/Connections';

const CONNECTION_TRY_BEFORE_TIMEOUT_SECONDS = 60 * 1000;

const waitTillConnection = async (con: Sequelize): Promise<Error> => {
    let msElapsed = 0;
    return new Promise((res) => {
        let itvl = setInterval(async () => {
            // every second try for connection
            if (msElapsed >= CONNECTION_TRY_BEFORE_TIMEOUT_SECONDS) {
                clearInterval(itvl);
                console.log('connection_factory', 'timed out :(');
                res(new Error(`Connection retry has exceeded timeout`));
            }
            await con
                .query('select 1')
                .then((data) => {
                    console.log('connection_factory', 'got connection !', data);
                    clearInterval(itvl);
                    res(null);
                })
                .catch(() => {
                    console.log(
                        'connection_factory',
                        'retrying ...',
                        msElapsed / 1000,
                        's'
                    );
                    msElapsed += 1000;
                });
        }, 1000);
    });
};

/**
 * Async Create a connection after making
 * sure it's actually ready to process sql commands
 * @param type
 * @param opts
 */
export const CreateConnection = async (
    type: DBType,
    opts: Map<string, string>
): Promise<ErrorTuple<Sequelize>> => {
    let connectionString: string = '';
    let host = opts.get('host');
    host = host ? host : '127.0.0.1';
    switch (type) {
        case 'mysql':
            connectionString = `mysql://${opts.get('user_name')}:${opts.get(
                'password'
            )}@${host}:${opts.get('port')}/${opts.get('default_db')}`;
            break;
        default:
            return Promise.resolve([
                null,
                new Error('Unsupported Database Type'),
            ]);
    }
    const con = new Sequelize(connectionString);
    console.log('connection factory', 'waiting till conneciton');
    let err = await waitTillConnection(con);
    return err ? [null, err] : [con, null];
};
