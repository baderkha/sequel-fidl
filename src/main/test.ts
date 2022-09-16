import { LiveConnection } from './model/LiveConnection';
import { PlaygroundConnection } from './model/PlaygroundConnection';
import { LiveConnectionSQLiteRepo } from './repository/LiveConnectionSQLite';
import { PlaygroudConnectionsRepoSQLite } from './repository/PlaygroundConnection';
import { ConManager } from './service/Connections';
import { PlayGroundManger } from './service/db/PlaygroundManager';
import { PlaygroundService } from './service/PlaygroundService';
import { Sequelize } from 'sequelize';
import { migrate } from './util/store/model';
import { pubsub, SHUTDOWN_SERVICE_EV } from './util/pubsub';

const main = async () => {
    const db = new Sequelize('sqlite::memory:');
    const liveConRepo = new LiveConnectionSQLiteRepo(new LiveConnection(), db);
    const playGroundRepo = new PlaygroudConnectionsRepoSQLite(
        new PlaygroundConnection(),
        db
    );
    await migrate(LiveConnection, db);
    await migrate(PlaygroundConnection, db);

    const ser = new PlaygroundService(
        ConManager.GetInstance(),
        liveConRepo,
        playGroundRepo,
        PlayGroundManger.Default()
    );

    const [res] = await ser.newPlayground('MYSQL', '5.7');

    const [conID] = await ser.connectToLivePlayground(res.pground, res.procId);

    console.log(conID);

    console.log(await ser.GetAllLiveConnections());
    console.log(
        await ser.RunSQL(
            conID,
            `CREATE TABLE authors (id INT, name VARCHAR(20), email VARCHAR(20));`
        )
    );
    console.log(
        await ser.RunSQL(
            conID,
            `INSERT INTO authors (id,name,email) VALUES(1,"Vivek","xuz@abc.com");`
        )
    );
    console.log(
        JSON.stringify(await ser.RunSQL(conID, 'SHOW TABLES'), null, 4)
    );

    console.log(
        JSON.stringify(
            await ser.RunSQL(conID, 'SELECT * FROM authors'),
            null,
            4
        )
    );
};

(async () => {
    await main();
    let num = 1;
    if (1 == num) {
        pubsub.emit(SHUTDOWN_SERVICE_EV, true);
    }
})();
