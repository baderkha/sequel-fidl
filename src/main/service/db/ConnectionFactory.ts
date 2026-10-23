import { ErrorTuple } from '../../util/tuple';
import { Sequelize } from 'sequelize';
import { DATABASES } from '../../../shared/db/dialects';
import { DBType } from '../../model/Connections';
import {Client} from 'ssh2'
import net from 'net';

const CONNECTION_TRY_BEFORE_TIMEOUT_MS = 60 * 1000;
const RETRY_EVERY_MS = 1000;
const LOCAL_HOST  = "127.0.0.1"
export type SSHConnection = {
    host: string;
    port: number | string;
    username: string;
    password?: string;
    privateKey?: Buffer;
}
export type ConnectionConfig = {
    host: string;
    port: number;
    username: string;
    password: string;
    /** empty => no default database */
    database?: string;
    ssh?: SSHConnection
};

/**
 * Poll the connection until it answers or the timeout passes
 * @param con
 * @param timeoutMs 0 => a single attempt
 * @param onRetry called before every retry
 */
export const waitTillConnection = async (
    con: Sequelize,
    timeoutMs = CONNECTION_TRY_BEFORE_TIMEOUT_MS,
    onRetry?: (elapsedMs: number) => void
): Promise<Error> => {
    const started = Date.now();
    for (;;) {
        try {
            await con.query('select 1');
            return null;
        } catch (err) {
            const elapsed = Date.now() - started;
            if (elapsed >= timeoutMs) {
                return timeoutMs > 0
                    ? new Error(
                          `Timed out after ${Math.round(elapsed / 1000)}s: ${
                              (err as Error).message
                          }`
                      )
                    : (err as Error);
            }
            onRetry && onRetry(elapsed);
            await new Promise((r) => setTimeout(r, RETRY_EVERY_MS));
        }
    }
};

/**
 * create an ssh forwarding tunnel that can be used for db cons that need a jumpbox
 * @param cfg 
 * @returns 
 */
export const CreateSSHForwardingTunnel = async (
    cfg: ConnectionConfig,
): Promise<ErrorTuple<net.Server>> {
    try {
         const ssh = new Client();
         await new Promise((resolve,reject)=>{
            ssh.on('ready',resolve).on('error',reject).connect({
                host: cfg.ssh.host,
                port : typeof (cfg.ssh.port) == "string" ? parseInt(cfg.ssh.port,10) : cfg.ssh.port,
                username : cfg.ssh.username,
                password : cfg.ssh.password,
                privateKey: cfg.ssh.privateKey
            })
        })
        const server = net.createServer((socket)=>{
            ssh.forwardOut(LOCAL_HOST,0,cfg.host,cfg.port,(err,stream)=>{
                if (err) {
                    socket.destroy(err)
                    return
                }
                socket.pipe(stream).pipe(socket)
                socket.on("error", () => stream.destroy());
                stream.on("error", () => socket.destroy());
            })
        })

        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, LOCAL_HOST, resolve);
        });
        server.on('close',()=>{
            ssh.destroy();
        })
        return [server,null];
    } catch (err : Error) {
        return [null,err]
    }
}

/**
 * Async Create a connection after making
 * sure it's actually ready to process sql commands
 * @param type
 * @param cfg
 * @param timeoutMs how long to keep retrying (playgrounds need time to boot) , 0 => fail fast
 * @param onRetry
 */
export const CreateConnection = async (
    type: DBType,
    cfg: ConnectionConfig,
    timeoutMs = CONNECTION_TRY_BEFORE_TIMEOUT_MS,
    onRetry?: (elapsedMs: number) => void
): Promise<ErrorTuple<Sequelize>> => {
    if (['mysql','postgres'].filter((el)=>el == type).length <= 0) {
        return [null, new Error('Unsupported Database Type')];
    }
    let additionalShutdowns = () => {}
    
    if (cfg.ssh) {
       const [server,err] = await CreateSSHForwardingTunnel(cfg);
        if (err) {
            return [null,err]
        }
        // override port and host since they change because of tunneling
        cfg.port = (server.address() as net.AddressInfo).port
        cfg.host = LOCAL_HOST
        additionalShutdowns = ()=>{
            server.close()
        }
    }
   
    const con = new Sequelize(cfg.database || DATABASES[type].database, cfg.username, cfg.password, {
        host: cfg.host || '127.0.0.1',
        port: cfg.port,
        dialect: type,
        logging: false,
        pool: { max: 5, min: 0, idle: 10000 },
        dialectOptions: type === 'postgres' ? { connectionTimeoutMillis: 10000 } : {
            multipleStatements: true,
            connectTimeout: 10000,
            // keep DECIMAL / BIGINT precision
            supportBigNumbers: true,
            dateStrings: false,
        },
    });
    let close = con.close.bind(con)
    con.close = async () =>{
        await close()
        additionalShutdowns() // add override for any extra shutdown ops i need to do
    }
    const err = await waitTillConnection(con, timeoutMs, onRetry);
    if (err) {
        await con.close().catch(() => {});

        return [null, err];
    }
    return [con, null];
};
