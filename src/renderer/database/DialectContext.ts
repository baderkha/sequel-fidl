import React from 'react';
import type { DatabaseType } from 'shared/db/dialects';

export const DialectContext = React.createContext<DatabaseType>('mysql');
export const useDatabaseDialect = () => React.useContext(DialectContext);
