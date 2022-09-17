import { LiveConnection } from './model/LiveConnection';
import { PlaygroundConnection } from './model/PlaygroundConnection';
import { LiveConnectionSQLiteRepo } from './repository/LiveConnectionSQLite';
import { PlaygroudConnectionsRepoSQLite } from './repository/PlaygroundConnection';
import { ConManager } from './service/Connections';
import { PlayGroundManger } from './service/db/PlaygroundManager';
import { PlaygroundInitService } from './service/PlaygroundInitService';
import { Sequelize } from 'sequelize';
import { migrate } from './util/store/model';
import { SHUTDOWN_SERVICE_EV } from './util/pubsub';
import { ipcMain } from 'electron';
import { MYSQLAdminCommand } from './util/sql_admin_commands/MYSQLAdminCommand';

const main = async () => {
    const db = new Sequelize('sqlite::memory:');
    const liveConRepo = new LiveConnectionSQLiteRepo(new LiveConnection(), db);
    const playGroundRepo = new PlaygroudConnectionsRepoSQLite(
        new PlaygroundConnection(),
        db
    );
    await migrate(LiveConnection, db);
    await migrate(PlaygroundConnection, db);

    const ser = new PlaygroundInitService(
        ConManager.GetInstance(),
        liveConRepo,
        playGroundRepo,
        PlayGroundManger.Default()
    );

    const [res] = await ser.newPlayground('mysql', '5.7');

    const [conID] = await ser.connectToLivePlayground(res.pground, res.procId);

    console.log(conID);

    console.log(await ser.GetAllLiveConnections());
    console.log(
        await ser.RunSQL(
            conID,
            `CREATE TABLE authors (id INT PRIMARY KEY, name VARCHAR(20), email VARCHAR(20));`
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

    const adminCommands = new MYSQLAdminCommand();
    let [_, con] = ConManager.GetInstance().GetConById(conID);
    console.log(
        await adminCommands.CreateTable(con, 'author_v2', [
            {
                FieldName: 'id',
                IsPrimaryKey: true,
                Default: 'AUTO_INCREMENT',
                NullAllowed: false,
                Type: 'INT(11)',
            },
            {
                FieldName: 'first_name',
                IsPrimaryKey: false,
                Default: '',
                NullAllowed: true,
                Type: 'VARCHAR(255)',
            },
        ])
    );
    console.log(await adminCommands.ShowAllTables(con));
    console.log(await adminCommands.ShowCreateSQL(con, 'authors'));
    console.log(await adminCommands.ListDatabases(con));
    console.log(await adminCommands.ShowSchema(con, 'authors'));
};

(async () => {
    await main();
    let num = 1;
    if (1 == num) {
        ipcMain.emit(SHUTDOWN_SERVICE_EV, true);
    }
})();
